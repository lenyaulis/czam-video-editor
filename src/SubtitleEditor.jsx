import React, { useState, useRef, useEffect } from 'react';
import './SubtitleEditor.css';

const FONTS = [
  { name: 'Arial', value: 'Arial, sans-serif' },
  { name: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { name: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { name: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { name: 'Verdana', value: 'Verdana, Arial, sans-serif' },
  { name: 'Comic Sans MS', value: '"Comic Sans MS", cursive' },
  { name: 'Impact', value: 'Impact, "Arial Black", sans-serif' },
  { name: 'Trebuchet MS', value: '"Trebuchet MS", Arial, sans-serif' },
  { name: 'Courier New', value: '"Courier New", Courier, monospace' },
  { name: 'Tahoma', value: 'Tahoma, Arial, sans-serif' }
];

// Функция для проверки доступности шрифта
function isFontAvailable(fontName) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  // Тестовый текст
  const testText = 'abcdefghijklmnopqrstuvwxyz0123456789';
  
  // Измеряем с fallback шрифтом
  context.font = '72px monospace';
  const fallbackWidth = context.measureText(testText).width;
  
  // Измеряем с нужным шрифтом
  context.font = `72px ${fontName}, monospace`;
  const testWidth = context.measureText(testText).width;
  
  // Если ширина отличается, значит шрифт загружен
  return Math.abs(testWidth - fallbackWidth) > 1;
}

// Функция для получения лучшего доступного шрифта
function getBestAvailableFont(fontValue) {
  const fonts = fontValue.split(',').map(f => f.trim().replace(/['"]/g, ''));
  
  for (const font of fonts) {
    if (font === 'sans-serif' || font === 'serif' || font === 'monospace' || font === 'cursive') {
      return fontValue; // Возвращаем весь fallback список
    }
    if (isFontAvailable(font)) {
      return fontValue; // Возвращаем весь fallback список
    }
  }
  
  return 'Arial, sans-serif'; // Последний fallback
}

function SubtitleEditor({ isOpen, onClose, onCreateSubtitles, videoDuration, existingSubtitles = null, audioFile = null, audioTrimConfig = null }) {
  const [localVideoDuration, setLocalVideoDuration] = useState(30);
  const [subtitleCount, setSubtitleCount] = useState(3);
  const [subtitles, setSubtitles] = useState([]);
  const [selectedFont, setSelectedFont] = useState('Arial, sans-serif');
  const [fontSize, setFontSize] = useState(48);
  const [previewVideo, setPreviewVideo] = useState(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const canvasRef = useRef(null);
  const audioRef = useRef(null);

  // Обновляем локальную длительность при получении данных от родителя
  useEffect(() => {
    if (videoDuration) {
      setLocalVideoDuration(videoDuration);
    }
  }, [videoDuration]);

  // Инициализация субтитров при изменении количества или при получении готовых субтитров
  useEffect(() => {
    if (existingSubtitles && existingSubtitles.length > 0) {
      // Используем готовые субтитры из распознавания речи
      setSubtitles(existingSubtitles);
      setSubtitleCount(existingSubtitles.length);
      console.log('Loaded existing subtitles:', existingSubtitles);
    } else {
      // Создаем пустые субтитры как раньше
      const timePerSubtitle = localVideoDuration / subtitleCount;
      const newSubtitles = Array.from({ length: subtitleCount }, (_, index) => ({
        id: index,
        text: subtitles[index]?.text || '',
        startTime: Math.round(index * timePerSubtitle * 10) / 10,
        endTime: Math.round((index + 1) * timePerSubtitle * 10) / 10
      }));
      setSubtitles(newSubtitles);
    }
  }, [subtitleCount, localVideoDuration, existingSubtitles]);

  const updateSubtitleText = (index, text) => {
    setSubtitles(prev => prev.map((sub, i) => 
      i === index ? { ...sub, text } : sub
    ));
  };

  const updateSubtitleTime = (index, field, value) => {
    setSubtitles(prev => prev.map((sub, i) => 
      i === index ? { ...sub, [field]: parseFloat(value) || 0 } : sub
    ));
  };

  // Функции для работы с аудио
  const toggleAudioPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isAudioPlaying) {
      audio.pause();
      setIsAudioPlaying(false);
    } else {
      // Начинаем с начала выбранного отрезка
      if (audioTrimConfig) {
        audio.currentTime = audioTrimConfig.startTime;
      }
      audio.play().then(() => {
        setIsAudioPlaying(true);
      }).catch(e => {
        console.error('Audio play failed:', e);
      });
    }
  };

  const handleAudioTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !audioTrimConfig) return;

    // Останавливаем на конце отрезка
    if (audio.currentTime >= audioTrimConfig.endTime) {
      audio.pause();
      setIsAudioPlaying(false);
      audio.currentTime = audioTrimConfig.startTime;
    }
  };

  const createPreviewVideo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = 1280;
    canvas.height = 720;

    // Черный фон для предварительного просмотра
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Получаем лучший доступный шрифт
    const bestFont = getBestAvailableFont(selectedFont);
    
    // Настройки текста
    ctx.font = `bold ${fontSize}px ${bestFont}`;
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = Math.max(3, fontSize / 16);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    console.log('Preview using font:', `bold ${fontSize}px ${bestFont}`);

    // Показываем все субтитры для предварительного просмотра
    const validSubtitles = subtitles.filter(sub => sub.text.trim());
    const lineHeight = fontSize + 15;
    const totalHeight = validSubtitles.length * lineHeight;
    const startY = canvas.height - 120 - totalHeight / 2;

    validSubtitles.forEach((subtitle, index) => {
      const x = canvas.width / 2;
      const y = startY + (index * lineHeight);
      
      ctx.strokeText(subtitle.text, x, y);
      ctx.fillText(subtitle.text, x, y);
    });

    // Конвертируем в blob для предварительного просмотра
    canvas.toBlob(blob => {
      if (previewVideo) {
        URL.revokeObjectURL(previewVideo);
      }
      setPreviewVideo(URL.createObjectURL(blob));
    });
  };

  const handleCreateSubtitles = () => {
    const validSubtitles = subtitles.filter(sub => sub.text.trim());
    if (validSubtitles.length === 0) {
      alert('Добавьте хотя бы один субтитр!');
      return;
    }

    onCreateSubtitles({
      subtitles: validSubtitles,
      font: selectedFont,
      fontSize,
      videoDuration: localVideoDuration
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="subtitle-editor-overlay">
      <div className="subtitle-editor">
        <div className="subtitle-editor-header">
          <h2>Редактор субтитров</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="subtitle-editor-content">
          <div className="subtitle-settings">
            <div className="setting-group">
              <label>Длительность видео (сек):</label>
              <input
                type="number"
                min="1"
                max="300"
                value={localVideoDuration}
                onChange={(e) => setLocalVideoDuration(parseInt(e.target.value) || 30)}
                disabled={!!videoDuration}
                className={videoDuration ? "auto-detected" : ""}
              />
              {videoDuration && (
                <small className="auto-detected-label">
                  ✓ Определено автоматически из загруженных видео
                </small>
              )}
            </div>

            <div className="setting-group">
              <label>Количество субтитров:</label>
              <div className="count-input-group">
                <button 
                  type="button"
                  className="count-btn"
                  onClick={() => setSubtitleCount(Math.max(1, subtitleCount - 1))}
                  disabled={subtitleCount <= 1}
                >
                  −
                </button>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={subtitleCount}
                  onChange={(e) => setSubtitleCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                  className="count-input"
                />
                <button 
                  type="button"
                  className="count-btn"
                  onClick={() => setSubtitleCount(Math.min(20, subtitleCount + 1))}
                  disabled={subtitleCount >= 20}
                >
                  +
                </button>
              </div>
            </div>

            <div className="setting-group">
              <label>Шрифт:</label>
              <select value={selectedFont} onChange={(e) => setSelectedFont(e.target.value)}>
                {FONTS.map(font => (
                  <option key={font.value} value={font.value}>{font.name}</option>
                ))}
              </select>
              <button 
                className="btn btn-test-font"
                onClick={createPreviewVideo}
                type="button"
              >
                Тест шрифта
              </button>
            </div>

            <div className="setting-group">
              <label>Размер шрифта:</label>
              <input
                type="range"
                min="24"
                max="72"
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value))}
              />
              <span>{fontSize}px</span>
            </div>

            {audioFile && audioTrimConfig && (
              <div className="setting-group audio-player-group">
                <label>🎵 Прослушать выбранный отрезок:</label>
                <div className="audio-player-controls">
                  <button 
                    className="btn btn-audio-play"
                    onClick={toggleAudioPlayback}
                    type="button"
                  >
                    {isAudioPlaying ? '⏸ Остановить' : '▶ Воспроизвести'}
                  </button>
                  <small className="audio-info">
                    Отрезок: {audioTrimConfig.startTime.toFixed(1)} - {audioTrimConfig.endTime.toFixed(1)} сек
                    ({audioTrimConfig.duration.toFixed(1)} сек)
                  </small>
                </div>
              </div>
            )}
          </div>

          <div className="subtitle-list">
            <div className="subtitle-list-header">
              <h3>Субтитры:</h3>
              <div className="subtitle-actions">
                <button 
                  className="btn btn-add-subtitle"
                  onClick={() => setSubtitleCount(prev => Math.min(20, prev + 1))}
                  type="button"
                >
                  + Добавить
                </button>
                <button 
                  className="btn btn-remove-subtitle"
                  onClick={() => setSubtitleCount(prev => Math.max(1, prev - 1))}
                  type="button"
                  disabled={subtitleCount <= 1}
                >
                  - Убрать
                </button>
              </div>
            </div>
            {subtitles.map((subtitle, index) => (
              <div key={subtitle.id} className="subtitle-item">
                <div className="subtitle-number">#{index + 1}</div>
                <div className="subtitle-inputs">
                  <input
                    type="text"
                    placeholder={`Текст субтитра ${index + 1}`}
                    value={subtitle.text}
                    onChange={(e) => updateSubtitleText(index, e.target.value)}
                    className="subtitle-text-input"
                  />
                  <div className="time-inputs">
                    <label>
                      С:
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max={localVideoDuration}
                        value={subtitle.startTime}
                        onChange={(e) => updateSubtitleTime(index, 'startTime', e.target.value)}
                      />
                    </label>
                    <label>
                      До:
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max={localVideoDuration}
                        value={subtitle.endTime}
                        onChange={(e) => updateSubtitleTime(index, 'endTime', e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="preview-section">
            <h3>Предварительный просмотр:</h3>
            <canvas ref={canvasRef} className="preview-canvas" />
            <div className="preview-controls">
              <button className="btn btn-preview" onClick={createPreviewVideo}>
                🔄 Обновить превью
              </button>
              <div className="preview-info">
                <p>Превью показывает все субтитры одновременно.</p>
                <p>В видео они будут появляться поочередно по времени.</p>
                <p>Поддерживается до 20 субтитров с индивидуальными временными интервалами.</p>
              </div>
            </div>
          </div>

          <div className="subtitle-editor-actions">
            <button className="btn btn-cancel" onClick={onClose}>
              Отмена
            </button>
            <button className="btn btn-create" onClick={handleCreateSubtitles}>
              ✨ Создать субтитры
            </button>
          </div>
        </div>

        {audioFile && (
          <audio
            ref={audioRef}
            src={URL.createObjectURL(audioFile)}
            onTimeUpdate={handleAudioTimeUpdate}
            onEnded={() => setIsAudioPlaying(false)}
            onError={(e) => console.error('Audio error:', e)}
            preload="auto"
          />
        )}
      </div>
    </div>
  );
}

export default SubtitleEditor;