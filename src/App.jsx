import "./App.css";
import "./index.css";

import React, { useRef, useState } from "react";
import { processVideos } from "./VideoProcessor";
import JSZip from "jszip";
import SubtitleEditor from "./SubtitleEditor";
import AudioTrimmer from "./AudioTrimmer";

const LOGO_URL = "/favicon.png";

// Функция для получения длительности видео
const getVideoDuration = (file) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    
    video.onerror = () => {
      window.URL.revokeObjectURL(video.src);
      reject(new Error('Не удалось загрузить видео'));
    };
    
    video.src = URL.createObjectURL(file);
  });
};

// Функция для проверки длительности всех видео
const validateVideoDurations = async (videoFiles) => {
  if (videoFiles.length === 0) return { isValid: true, duration: null };
  
  try {
    const durations = await Promise.all(
      videoFiles.map(file => getVideoDuration(file))
    );
    
    // Проверяем, что все длительности примерно одинаковые (разница не более 1 секунды)
    const firstDuration = durations[0];
    const tolerance = 1; // 1 секунда допустимой разницы
    
    const isValid = durations.every(duration => 
      Math.abs(duration - firstDuration) <= tolerance
    );
    
    return {
      isValid,
      duration: Math.round(firstDuration),
      durations: durations.map(d => Math.round(d * 10) / 10), // Округляем до 0.1 сек
      message: isValid 
        ? `Все видео имеют длительность ~${Math.round(firstDuration)} сек`
        : `Видео имеют разную длительность: ${durations.map(d => Math.round(d * 10) / 10).join(', ')} сек`
    };
  } catch (error) {
    return {
      isValid: false,
      duration: null,
      message: 'Ошибка при проверке длительности видео: ' + error.message
    };
  }
};

function Branding() {
  const [logoError, setLogoError] = useState(false);
  return (
    <div className="branding">
      {!logoError && (
        <img
          src={LOGO_URL}
          alt=""
          className="branding-logo"
          onError={() => setLogoError(true)}
        />
      )}
      <span className="branding-text">C-zam Creative</span>
    </div>
  );
}

function App() {
  const [videos, setVideos] = useState([]);
  const [song, setSong] = useState(null);
  const [subtitleConfig, setSubtitleConfig] = useState(null);
  const [isSubtitleEditorOpen, setIsSubtitleEditorOpen] = useState(false);
  const [isAudioTrimmerOpen, setIsAudioTrimmerOpen] = useState(false);
  const [audioTrimConfig, setAudioTrimConfig] = useState(null);
  const [videoDuration, setVideoDuration] = useState(null);
  const [progresses, setProgresses] = useState({});
  const [results, setResults] = useState({});
  const [processing, setProcessing] = useState(false);
  const [errors, setErrors] = useState({});
  const [drag, setDrag] = useState(false);
  const inputVideosRef = useRef(null);
  const inputSongRef = useRef(null);

  const handleVideoChange = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    
    if (selectedFiles.length === 0) {
      setVideos([]);
      setVideoDuration(null);
      setProgresses({});
      setResults({});
      setErrors({});
      return;
    }
    
    // Проверяем длительность видео
    const validation = await validateVideoDurations(selectedFiles);
    
    if (!validation.isValid) {
      alert(`⚠️ Ошибка загрузки видео:\n\n${validation.message}\n\nВсе видео должны иметь примерно одинаковую длительность (разница не более 1 секунды).`);
      
      // Очищаем input
      if (inputVideosRef.current) {
        inputVideosRef.current.value = "";
      }
      return;
    }
    
    setVideos(selectedFiles);
    setVideoDuration(validation.duration);
    setProgresses({});
    setResults({});
    setErrors({});
    
    // Показываем информацию о длительности
    console.log('Video validation result:', validation);
    
    // Если есть открытый редактор субтитров, обновляем его длительность
    if (subtitleConfig) {
      setSubtitleConfig(prev => ({
        ...prev,
        videoDuration: validation.duration
      }));
    }
  };

  const handleSongChange = (e) => {
    const selectedSong = e.target.files[0] || null;
    setSong(selectedSong);
    setAudioTrimConfig(null); // Сбрасываем настройки обрезки
    setProgresses({});
    setResults({});
    setErrors({});
    
    // Если есть видео и песня, автоматически открываем триммер
    if (selectedSong && videoDuration) {
      setIsAudioTrimmerOpen(true);
    }
  };

  const handleAudioTrim = (trimConfig) => {
    setAudioTrimConfig(trimConfig);
    console.log('Audio trim config:', trimConfig);
  };

  const handleSubtitlesGenerated = (generatedSubtitles) => {
    console.log('Generated subtitles:', generatedSubtitles);
    
    // Создаем конфигурацию субтитров из распознанного текста
    const subtitleConfig = {
      videoDuration: videoDuration,
      subtitles: generatedSubtitles.map(sub => ({
        id: sub.id,
        text: sub.text,
        startTime: sub.startTime,
        endTime: sub.endTime
      })),
      font: 'Arial', // Шрифт по умолчанию
      fontSize: 48,   // Размер по умолчанию
      color: '#ffffff' // Цвет по умолчанию
    };
    
    setSubtitleConfig(subtitleConfig);
    
    // Автоматически открываем редактор субтитров для редактирования
    setTimeout(() => {
      setIsSubtitleEditorOpen(true);
    }, 500);
  };

  const handleCreateSubtitles = (config) => {
    setSubtitleConfig(config);
    setProgresses({});
    setResults({});
    setErrors({});
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDrag(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "video/mp4"
    );
    
    if (files.length === 0) {
      setVideos([]);
      setVideoDuration(null);
      setProgresses({});
      setResults({});
      setErrors({});
      return;
    }
    
    // Проверяем длительность видео
    const validation = await validateVideoDurations(files);
    
    if (!validation.isValid) {
      alert(`⚠️ Ошибка загрузки видео:\n\n${validation.message}\n\nВсе видео должны иметь примерно одинаковую длительность (разница не более 1 секунды).`);
      return;
    }
    
    setVideos(files);
    setVideoDuration(validation.duration);
    setProgresses({});
    setResults({});
    setErrors({});
    
    console.log('Video validation result:', validation);
    
    // Если есть открытый редактор субтитров, обновляем его длительность
    if (subtitleConfig) {
      setSubtitleConfig(prev => ({
        ...prev,
        videoDuration: validation.duration
      }));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDrag(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDrag(false);
  };

  const handleConvert = async () => {
    if (!song || !videos.length) return;
    setProcessing(true);
    setProgresses({});
    setResults({});
    setErrors({});
    try {
      console.log("Starting video processing...", { videos: videos.length, song: song.name, subtitleConfig, audioTrimConfig });
      await processVideos({
        videos,
        song,
        subtitleConfig,
        audioTrimConfig,
        setProgress: (name, val) =>
          setProgresses((prev) => ({ ...prev, [name]: val })),
        setResult: (name, blob) =>
          setResults((prev) => ({ ...prev, [name]: blob })),
        setError: (name, err) => {
          console.error("Video processing error:", name, err);
          setErrors((prev) => ({
            ...prev,
            [name]: (err && err.message) || String(err),
          }));
        },
      });
    } catch (e) {
      console.error("General processing error:", e);
      alert("Ошибка: " + (e?.message ?? String(e)));
    }
    setProcessing(false);
  };

  const handleDownloadAll = async () => {
    try {
      const zip = new JSZip();
      Object.entries(results).forEach(([name, blob]) => {
        zip.file(name.replace(/\.mp4$/i, "_song.mp4"), blob);
      });
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "results.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      alert("Ошибка при создании ZIP: " + (e?.message ?? String(e)));
    }
  };

  const handleDownloadOne = (v) => {
    const blob = results[v.name];
    const fileName = v.name.replace(/\.mp4$/i, "_song.mp4");
    
    // Определяем iOS
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    if (isIOS) {
      // Для iOS используем специальный метод
      handleIOSDownload(blob, fileName, v.name);
    } else if ('showSaveFilePicker' in window) {
      // Для Android Chrome - современный API
      handleModernDownload(blob, fileName);
    } else {
      // Fallback для остальных
      handleLegacyDownload(blob, fileName);
    }
  };

  const handleIOSDownload = async (blob, fileName, originalName) => {
    try {
      // Конвертируем blob в data URL для iOS
      const reader = new FileReader();
      
      reader.onloadend = () => {
        const dataUrl = reader.result;
        
        // Создаем ссылку с data URL
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fileName;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
      
      reader.onerror = () => {
        console.error('FileReader error');
        // Fallback - открываем страницу с инструкцией
        showIOSInstructions(blob, fileName);
      };
      
      // Читаем blob как data URL
      reader.readAsDataURL(blob);
      
    } catch (error) {
      console.error('iOS download error:', error);
      // Fallback - открываем страницу с инструкцией
      showIOSInstructions(blob, fileName);
    }
  };

  const showIOSInstructions = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    
    const videoWindow = window.open('', '_blank');
    if (videoWindow) {
      videoWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${fileName}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              background: #000;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              color: #fff;
              padding: 1rem;
            }
            .container {
              width: 100%;
              max-width: 600px;
              text-align: center;
            }
            .instructions {
              background: rgba(167, 139, 250, 0.15);
              border: 2px solid rgba(167, 139, 250, 0.3);
              border-radius: 12px;
              padding: 1.5rem;
              margin-bottom: 1.5rem;
              backdrop-filter: blur(10px);
            }
            .instructions h2 {
              font-size: 1.3rem;
              margin-bottom: 1rem;
              color: #a78bfa;
            }
            .instructions ol {
              text-align: left;
              padding-left: 1.5rem;
              line-height: 2;
              font-size: 1.05rem;
            }
            .instructions li {
              margin-bottom: 0.75rem;
            }
            .instructions strong {
              color: #34d399;
            }
            video {
              width: 100%;
              max-width: 100%;
              border-radius: 8px;
              box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            }
            .filename {
              margin-top: 1rem;
              font-size: 0.9rem;
              color: #a1a1aa;
              word-break: break-all;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="instructions">
              <h2>📱 Как сохранить видео на iPhone</h2>
              <ol>
                <li>Нажмите и <strong>удерживайте палец</strong> на видео ниже</li>
                <li>В меню выберите <strong>"Сохранить видео"</strong></li>
                <li>Видео сохранится в <strong>"Фото"</strong></li>
              </ol>
            </div>
            <video controls playsinline preload="auto">
              <source src="${url}" type="video/mp4">
            </video>
            <div class="filename">${fileName}</div>
          </div>
        </body>
        </html>
      `);
      videoWindow.document.close();
    }
    
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const handleModernDownload = async (blob, fileName) => {
    try {
      const opts = {
        suggestedName: fileName,
        types: [{
          description: 'Video files',
          accept: {'video/mp4': ['.mp4']},
        }],
      };
      
      const handle = await window.showSaveFilePicker(opts);
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      
      alert('✅ Видео успешно сохранено!');
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Save error:', err);
        handleLegacyDownload(blob, fileName);
      }
    }
  };

  const handleLegacyDownload = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handlePreviewOne = (v) => {
    const blob = results[v.name];
    const url = URL.createObjectURL(blob);
    
    // Открываем в новой вкладке
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${v.name}</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              background: #000;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
            }
            video {
              max-width: 100%;
              max-height: 100vh;
              width: auto;
              height: auto;
            }
          </style>
        </head>
        <body>
          <video controls autoplay>
            <source src="${url}" type="video/mp4">
            Ваш браузер не поддерживает видео.
          </video>
        </body>
        </html>
      `);
      newWindow.document.close();
    } else {
      alert('Не удалось открыть окно просмотра. Проверьте, не блокирует ли браузер всплывающие окна.');
    }
    
    // Очищаем URL через минуту
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const handleNewConversion = () => {
    setVideos([]);
    setSong(null);
    setSubtitleConfig(null);
    setAudioTrimConfig(null);
    setVideoDuration(null);
    setProgresses({});
    setResults({});
    setErrors({});
    setDrag(false);
    if (inputVideosRef.current) inputVideosRef.current.value = "";
    if (inputSongRef.current) inputSongRef.current.value = "";
  };

  const canConvert = !!song && !!videos.length && !processing;
  const hasResults = Object.keys(results).length > 0;

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Видео + музыка + субтитры</h1>
        <p className="subtitle">
          Наложи песню и субтитры на несколько роликов — быстро и просто
        </p>
      </header>

      <div
        className={`dropzone ${drag ? "drag" : ""} ${processing ? "disabled" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <span className="dropzone-label">
          📁 Видео .mp4
        </span>
        <p className="dropzone-hint">
          Перетащи файлы сюда или выбери через кнопку<br/>
          <small>Все видео должны иметь одинаковую длительность</small>
        </p>
        <input
          type="file"
          accept="video/mp4"
          multiple
          ref={inputVideosRef}
          className="hidden"
          onChange={handleVideoChange}
          disabled={processing}
        />
        <button
          type="button"
          className="btn btn-video"
          onClick={() => inputVideosRef.current?.click()}
          disabled={processing}
        >
          Выбрать видео
        </button>
        <span className={`file-stat ${videos.length ? "has" : ""}`}>
          {videos.length
            ? `✓ ${videos.length} ${videos.length === 1 ? "файл" : "файлов"}${videoDuration ? ` (${videoDuration} сек)` : ""}`
            : "Нет выбранных видео"}
        </span>
      </div>

      <div
        className={`dropzone ${processing ? "disabled" : ""}`}
        style={{ borderStyle: "solid", borderColor: "var(--bg-elevated)" }}
      >
        <span className="dropzone-label">🎵 Песня .mp3</span>
        <p className="dropzone-hint">Одна мелодия для всех роликов</p>
        <input
          type="file"
          accept="audio/mpeg,audio/mp3"
          ref={inputSongRef}
          className="hidden"
          onChange={handleSongChange}
          disabled={processing}
        />
        <button
          type="button"
          className="btn btn-song"
          onClick={() => inputSongRef.current?.click()}
          disabled={processing}
        >
          Выбрать песню
        </button>
        {song && videoDuration && (
          <button
            type="button"
            className="btn btn-trim"
            onClick={() => setIsAudioTrimmerOpen(true)}
            disabled={processing}
          >
            🎵 Обрезать трек
          </button>
        )}
        <span className={`file-stat ${song ? "has" : ""}`}>
          {song ? (
            <>
              ✓ {song.name}
              {audioTrimConfig && (
                <span className="trim-info">
                  {" "}(обрезка: {audioTrimConfig.startTime.toFixed(1)}-{audioTrimConfig.endTime.toFixed(1)} сек)
                </span>
              )}
            </>
          ) : "Нет песни"}
        </span>
      </div>

      <div className={`subtitles-section ${processing ? "disabled" : ""}`}>
        <span className="dropzone-label">📝 Субтитры (опционально)</span>
        <p className="dropzone-hint">
          Создайте профессиональные субтитры с настройкой времени и шрифтов
        </p>
        <button
          type="button"
          className="btn btn-subtitles"
          onClick={() => setIsSubtitleEditorOpen(true)}
          disabled={processing}
        >
          ✨ Редактор субтитров
        </button>
        <span className={`file-stat ${subtitleConfig ? "has" : ""}`}>
          {subtitleConfig 
            ? `✓ ${subtitleConfig.subtitles.length} субтитров (${subtitleConfig.font}, ${subtitleConfig.fontSize}px)`
            : "Субтитры не настроены"
          }
        </span>
      </div>

      <div className="convert-wrap">
        <button
          type="button"
          className="btn btn-convert"
          disabled={!canConvert}
          onClick={handleConvert}
        >
          {processing ? "⏳ Обрабатываю…" : "▶ Преобразовать"}
        </button>
      </div>

      {videos.length > 0 && (
        <section className="video-list" aria-label="Список видео">
          {videos.map((v, i) => {
            const done = !!results[v.name];
            const err = errors[v.name];
            const prog = progresses[v.name];
            const statusClass = err
              ? "error"
              : done
                ? "done"
                : "waiting";

            return (
              <div
                key={`${v.name}-${v.size}-${i}`}
                className={`video-card ${done ? "done" : ""} ${err ? "error" : ""}`}
              >
                <div className="video-name">{v.name}</div>
                <div className={`video-status ${statusClass}`}>
                  {err ? (
                    <>❌ {err}</>
                  ) : done ? (
                    <>✅ Готово</>
                  ) : prog != null ? (
                    <div className="progress-wrap">
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${Math.min(100, Math.max(0, (prog ?? 0) * 100))}%`,
                          }}
                        />
                      </div>
                      <span className="progress-pct">
                        {Math.round((prog ?? 0) * 100)}%
                      </span>
                    </div>
                  ) : (
                    <>⏸ Ожидание…</>
                  )}
                </div>
                {done && (
                  <div className="video-actions">
                    <button
                      type="button"
                      className="btn-preview"
                      onClick={() => handlePreviewOne(v)}
                    >
                      👁 Просмотр
                    </button>
                    <button
                      type="button"
                      className="btn-download"
                      onClick={() => handleDownloadOne(v)}
                    >
                      ↓ Скачать
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {hasResults && (
        <div className="results-actions">
          <button
            type="button"
            className="btn btn-download-all"
            onClick={handleDownloadAll}
          >
            📦 Скачать всё ZIP
          </button>
          <button
            type="button"
            className="btn btn-new"
            onClick={handleNewConversion}
          >
            🔄 Новое преобразование
          </button>
        </div>
      )}

      {!hasResults && (videos.length > 0 || song) && !processing && (
        <button
          type="button"
          className="btn btn-new btn-new-secondary"
          onClick={handleNewConversion}
        >
          🔄 Новое преобразование
        </button>
      )}

      <footer className="footer">
        <Branding />
        <p>Нужен браузер с WebAssembly. FFmpeg грузится ~20 MB.</p>
        <p>Лучше тестировать на коротких роликах. Не больше ~100 видео за раз.</p>
        <p>Субтитры накладываются как текст поверх видео. При добавлении субтитров обработка займет больше времени.</p>
      </footer>

      <SubtitleEditor
        isOpen={isSubtitleEditorOpen}
        onClose={() => setIsSubtitleEditorOpen(false)}
        onCreateSubtitles={handleCreateSubtitles}
        videoDuration={videoDuration}
        existingSubtitles={subtitleConfig?.subtitles}
        audioFile={song}
        audioTrimConfig={audioTrimConfig}
      />

      <AudioTrimmer
        isOpen={isAudioTrimmerOpen}
        onClose={() => setIsAudioTrimmerOpen(false)}
        audioFile={song}
        videoDuration={videoDuration}
        onTrimChange={handleAudioTrim}
      />
    </div>
  );
}

export default App;
