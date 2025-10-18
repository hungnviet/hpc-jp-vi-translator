import { useState, useRef } from 'react';

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [translation, setTranslation] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'record' | 'upload' | 'realtime'>('record');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const realtimeRecorderRef = useRef<MediaRecorder | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  // Use a ref to mirror isStreaming state inside async callbacks
  const streamingRef = useRef<boolean>(false);
  // Additional refs for voice activity detection (VAD)
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadLoopIdRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number>(0);
  const isSpeakingRef = useRef<boolean>(false);
  const chunksRef = useRef<Blob[]>([]);

  // Helper to play base64-encoded audio using the browser's Audio API. The
  // returned promise resolves when playback starts or rejects on error.
  const playAudioFromBase64 = (base64: string) => {
    if (!base64) return;
    const audioSrc = `data:audio/mp3;base64,${base64}`;
    const audio = new Audio(audioSrc);
    // Attempt to play the audio; catching exceptions avoids unhandled rejections
    audio.play().catch((err) => {
      console.error('Error playing audio', err);
    });
  };

  const startRecording = async () => {
    setTranslation('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          setLoading(true);
          try {
            const response = await fetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio: base64 }),
            });
            const data = await response.json();
            setTranslation(data.translation);
            // Play the synthesized Vietnamese audio if available
            if (data.audio) {
              playAudioFromBase64(data.audio);
            }
          } catch (error) {
            console.error('Error translating', error);
          } finally {
            setLoading(false);
          }
        };
        reader.readAsDataURL(audioBlob);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Microphone error', error);
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.stop();
      recorder.stream.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setTranslation('');
    const reader = new FileReader();
    reader.onloadend = async () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      setLoading(true);
      try {
        const response = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64 }),
        });
        const data = await response.json();
        setTranslation(data.translation);
        // Play the synthesized Vietnamese audio if available
        if (data.audio) {
          playAudioFromBase64(data.audio);
        }
      } catch (error) {
        console.error('Error translating', error);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const startRealtimeTranslation = async () => {
    // Reset translation output
    setTranslation('');
    // Initialize audio stream and VAD components
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Create an AudioContext for analyzing audio energy
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      const bufferLength = analyser.fftSize;
      const dataArray = new Uint8Array(bufferLength);
      source.connect(analyser);

      // Store references so we can clean up later
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      silenceStartRef.current = Date.now();
      isSpeakingRef.current = false;
      chunksRef.current = [];

      // Set up the MediaRecorder to capture audio chunks when speech is detected
      const mediaRecorder = new MediaRecorder(stream);
      realtimeRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // When recording stops (end of utterance), send the accumulated audio to the API
        if (chunksRef.current.length === 0) {
          return;
        }
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          try {
            setLoading(true);
            const response = await fetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio: base64 }),
            });
            const data = await response.json();
            // Append new translation segment to existing translation
            setTranslation((prev) => {
              const segment = data.translation || '';
              if (!prev) return segment;
              return prev + '\n' + segment;
            });
            // Play the synthesized Vietnamese audio for this segment
            if (data.audio) {
              playAudioFromBase64(data.audio);
            }
          } catch (error) {
            console.error('Error translating utterance', error);
          } finally {
            setLoading(false);
          }
        };
        reader.readAsDataURL(audioBlob);
        // Reset chunks and speech flag to prepare for next utterance
        chunksRef.current = [];
        isSpeakingRef.current = false;
      };

      // Helper to compute RMS (Root Mean Square) to gauge loudness
      const calculateRMS = (data: Uint8Array) => {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const normalized = data[i] / 128 - 1;
          sum += normalized * normalized;
        }
        return Math.sqrt(sum / data.length);
      };

      const silenceThreshold = 0.01; // 1% of max amplitude
      const silenceDuration = 800; // milliseconds to detect end of sentence

      const detectSpeechLoop = () => {
        // If streaming has been stopped, end the loop
        if (!streamingRef.current) return;
        analyser.getByteTimeDomainData(dataArray);
        const rms = calculateRMS(dataArray);
        const now = Date.now();

        if (rms < silenceThreshold) {
          // Currently silent
          if (isSpeakingRef.current) {
            // We were speaking, check if silence persists long enough to end the utterance
            if (now - silenceStartRef.current > silenceDuration) {
              // Stop the recorder if it's currently recording
              if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
              }
            }
          } else {
            // Continue silence, update silence start if not already
            // Only update if more than 200ms difference to avoid drift
            if (now - silenceStartRef.current > 200) {
              silenceStartRef.current = now;
            }
          }
        } else {
          // Speech detected
          if (!isSpeakingRef.current) {
            // Starting a new utterance
            isSpeakingRef.current = true;
            silenceStartRef.current = now;
            chunksRef.current = [];
            if (mediaRecorder.state === 'inactive') {
              mediaRecorder.start();
            }
          } else {
            // Still speaking, reset silence start
            silenceStartRef.current = now;
          }
        }
        // Continue checking in the next animation frame
        vadLoopIdRef.current = requestAnimationFrame(detectSpeechLoop);
      };

      // Kick off the speech detection loop and mark streaming active
      setIsStreaming(true);
      // Mirror streaming state in ref for callback consistency
      streamingRef.current = true;
      detectSpeechLoop();
    } catch (error) {
      console.error('Microphone error', error);
    }
  };

  const stopRealtimeTranslation = () => {
    // Signal the speech detection loop to stop
    setIsStreaming(false);
    streamingRef.current = false;
    // Cancel the animation frame loop if it exists
    if (vadLoopIdRef.current !== null) {
      cancelAnimationFrame(vadLoopIdRef.current);
      vadLoopIdRef.current = null;
    }
    // Stop the media recorder if it's currently recording
    const recorder = realtimeRecorderRef.current;
    if (recorder) {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
      recorder.stream.getTracks().forEach((track) => track.stop());
    }
    // Close the audio context and disconnect analyser
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    // Reset flags and buffers
    analyserRef.current = null;
    isSpeakingRef.current = false;
    chunksRef.current = [];
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
      <h1 className="text-2xl font-bold mb-4">Dịch tiếng Nhật sang tiếng Việt</h1>
      <p className="mb-4 text-center max-w-xl">
        Nhấn nút để bắt đầu ghi âm tiếng Nhật. Sau khi dừng ghi âm, hệ thống sẽ tự động
        gửi đoạn âm thanh tới API của OpenAI để chuyển thành văn bản tiếng Nhật và dịch sang
        tiếng Việt.
      </p>
      {/* Mode selection */}
      <div className="mb-4 flex gap-4">
        <label className="flex items-center space-x-2">
          <input
            type="radio"
            name="mode"
            value="record"
            checked={mode === 'record'}
            onChange={() => setMode('record')}
            className="form-radio h-4 w-4"
          />
          <span>Ghi âm</span>
        </label>
        <label className="flex items-center space-x-2">
          <input
            type="radio"
            name="mode"
            value="upload"
            checked={mode === 'upload'}
            onChange={() => setMode('upload')}
            className="form-radio h-4 w-4"
          />
          <span>Tải tệp âm thanh</span>
        </label>
        <label className="flex items-center space-x-2">
          <input
            type="radio"
            name="mode"
            value="realtime"
            checked={mode === 'realtime'}
            onChange={() => setMode('realtime')}
            className="form-radio h-4 w-4"
          />
          <span>Dịch trực tiếp</span>
        </label>
      </div>
      {/* Conditional UI based on mode */}
      {mode === 'record' ? (
        isRecording ? (
          <button
            onClick={stopRecording}
            className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded"
            disabled={loading}
          >
            Dừng ghi âm và dịch
          </button>
        ) : (
          <button
            onClick={startRecording}
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded"
            disabled={loading}
          >
            Bắt đầu ghi âm
          </button>
        )
      ) : (
        mode === 'upload' ? (
          <div className="flex flex-col items-center">
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="mb-2"
              disabled={loading}
            />
            <p className="text-sm text-gray-600">
              Chọn tệp âm thanh (ví dụ: .mp3, .wav, .webm).
            </p>
          </div>
        ) : (
          // Realtime mode UI
          <div className="flex flex-col items-center">
            {isStreaming ? (
              <button
                onClick={stopRealtimeTranslation}
                className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded"
                disabled={loading}
              >
                Dừng dịch trực tiếp
              </button>
            ) : (
              <button
                onClick={startRealtimeTranslation}
                className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded"
                disabled={loading}
              >
                Bắt đầu dịch trực tiếp
              </button>
            )}
            <p className="mt-2 text-sm text-gray-600">
              Hệ thống sẽ ghi âm liên tục và dịch từng đoạn khi bạn nói.
            </p>
          </div>
        )
      )}
      {loading && <p className="mt-4 text-gray-600">Đang xử lý...</p>}
      {translation && (
        <div className="mt-6 w-full max-w-2xl p-4 bg-white rounded shadow">
          <h2 className="text-lg font-semibold mb-2">Kết quả dịch</h2>
          <p className="text-gray-800 whitespace-pre-wrap">{translation}</p>
        </div>
      )}
    </main>
  );
}