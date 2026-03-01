import React, { useRef, useEffect, useState } from 'react';
import './AudioTrimmer.css';

function AudioTrimmer({ audioFile, videoDuration, onTrimChange, isOpen, onClose }) {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [segmentStart, setSegmentStart] = useState(0); // Начало фиксированного отрезка
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  // Фиксированная длительность отрезка равна длительности видео
  const segmentDuration = videoDuration || 30;
  const segmentEnd = segmentStart + segmentDuration;

  // Загрузка и анализ аудио
  useEffect(() => {
    if (!audioFile || !isOpen) return;

    const loadAudio = async () => {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await audioFile.arrayBuffer();
        const buffer = await audioContext.decodeAudioData(arrayBuffer);
        
        setAudioBuffer(buffer);
        setDuration(buffer.duration);
        
        // Устанавливаем начальную позицию отрезка в начале трека
        setSegmentStart(0);
        
        console.log(`Audio loaded: ${buffer.duration}s, segment: ${segmentDuration}s`);
        
        // Рисуем waveform только один раз после загрузки
        setTimeout(() => {
          drawWaveform(buffer);
          drawSelection();
        }, 100);
        
        // Подготавливаем аудио элемент
        const audio = audioRef.current;
        if (audio && audioFile) {
          // Создаем новый URL для аудио
          const audioUrl = URL.createObjectURL(audioFile);
          audio.src = audioUrl;
          
          // Принудительно загружаем аудио
          audio.load();
          
          console.log('Audio element prepared with src:', audioUrl);
        }
        
      } catch (error) {
        console.error('Error loading audio:', error);
      }
    };

    loadAudio();
  }, [audioFile, isOpen]); // Убрали segmentDuration из зависимостей

  // Рисование waveform
  const drawWaveform = (buffer) => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Очищаем canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Получаем данные аудио
    const channelData = buffer.getChannelData(0);
    const samplesPerPixel = Math.floor(channelData.length / width);
    
    // Рисуем waveform
    ctx.fillStyle = '#a78bfa';
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 1;
    
    for (let x = 0; x < width; x++) {
      const start = x * samplesPerPixel;
      const end = start + samplesPerPixel;
      
      let min = 0;
      let max = 0;
      
      for (let i = start; i < end && i < channelData.length; i++) {
        const sample = channelData[i];
        if (sample > max) max = sample;
        if (sample < min) min = sample;
      }
      
      const yMax = (1 + max) * height / 2;
      const yMin = (1 + min) * height / 2;
      
      ctx.fillRect(x, yMin, 1, yMax - yMin);
    }
  };

  // Рисование выделенной области (БЕЗ перерисовки waveform)
  const drawSelection = () => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    const startX = (segmentStart / duration) * width;
    const endX = (segmentEnd / duration) * width;
    
    // Затемняем невыделенные области
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, startX, height);
    ctx.fillRect(endX, 0, width - endX, height);
    
    // Подсвечиваем выделенную область (слегка)
    ctx.fillStyle = 'rgba(52, 211, 153, 0.15)';
    ctx.fillRect(startX, 0, endX - startX, height);
    
    // Рисуем границы выделения
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, height);
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, height);
    ctx.stroke();
    
    // Рисуем центральную полосу для перетаскивания
    const centerX = (startX + endX) / 2;
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(centerX, height * 0.2);
    ctx.lineTo(centerX, height * 0.8);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Добавляем текст с информацией об отрезке
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${segmentDuration}s`, centerX, height * 0.5);
    
    // Рисуем текущую позицию воспроизведения
    if (isPlaying && audioRef.current) {
      const playbackTime = audioRef.current.currentTime;
      if (playbackTime >= segmentStart && playbackTime <= segmentEnd) {
        const currentX = (playbackTime / duration) * width;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(currentX, 0);
        ctx.lineTo(currentX, height);
        ctx.stroke();
      }
    }
  };

  // Полная перерисовка (waveform + selection)
  const redrawCanvas = () => {
    if (audioBuffer) {
      drawWaveform(audioBuffer);
      drawSelection();
    }
  };

  // Обработка начала перетаскивания (мышь)
  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTime = (x / canvas.width) * duration;
    
    // Проверяем, попал ли клик в область выделенного отрезка
    if (clickTime >= segmentStart && clickTime <= segmentEnd) {
      setIsDragging(true);
      setDragOffset(clickTime - segmentStart);
      canvas.style.cursor = 'grabbing';
    }
  };

  // Обработка начала перетаскивания (тач)
  const handleTouchStart = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return;

    e.preventDefault(); // Предотвращаем скролл
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const clickTime = (x / canvas.width) * duration;
    
    // Проверяем, попал ли тач в область выделенного отрезка
    if (clickTime >= segmentStart && clickTime <= segmentEnd) {
      setIsDragging(true);
      setDragOffset(clickTime - segmentStart);
      canvas.style.cursor = 'grabbing';
    }
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const mouseTime = (x / canvas.width) * duration;
    
    if (isDragging) {
      // Перемещаем отрезок
      const newStart = mouseTime - dragOffset;
      const maxStart = duration - segmentDuration;
      const clampedStart = Math.max(0, Math.min(maxStart, newStart));
      
      // Обновляем только если позиция действительно изменилась
      if (Math.abs(clampedStart - segmentStart) > 0.1) {
        setSegmentStart(clampedStart);
      }
    } else {
      // Меняем курсор в зависимости от позиции
      if (mouseTime >= segmentStart && mouseTime <= segmentEnd) {
        canvas.style.cursor = 'grab';
      } else {
        canvas.style.cursor = 'default';
      }
    }
  };

  // Обработка перемещения (тач)
  const handleTouchMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !duration || !isDragging) return;

    e.preventDefault(); // Предотвращаем скролл
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const mouseTime = (x / canvas.width) * duration;
    
    // Перемещаем отрезок
    const newStart = mouseTime - dragOffset;
    const maxStart = duration - segmentDuration;
    const clampedStart = Math.max(0, Math.min(maxStart, newStart));
    
    // Обновляем только если позиция действительно изменилась
    if (Math.abs(clampedStart - segmentStart) > 0.1) {
      setSegmentStart(clampedStart);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragOffset(0);
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = 'default';
    }
  };

  // Обработка окончания перетаскивания (тач)
  const handleTouchEnd = () => {
    setIsDragging(false);
    setDragOffset(0);
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = 'default';
    }
  };

  // Воспроизведение аудио - ИСПРАВЛЕННАЯ ВЕРСИЯ
  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) {
      console.error('Audio element not found');
      alert('Аудио элемент не найден!');
      return;
    }

    console.log('Toggle playback clicked, isPlaying:', isPlaying);
    console.log('Audio src:', audio.src);
    console.log('Audio readyState:', audio.readyState);
    console.log('Segment:', segmentStart, '-', segmentEnd);

    try {
      if (isPlaying) {
        console.log('Pausing audio...');
        audio.pause();
        setIsPlaying(false);
      } else {
        console.log('Starting playback...');
        
        // Ждем, пока аудио будет готово к воспроизведению
        if (audio.readyState < 2) {
          console.log('Audio not ready, waiting...');
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Timeout waiting for audio to load'));
            }, 5000);
            
            const onCanPlay = () => {
              clearTimeout(timeout);
              audio.removeEventListener('canplay', onCanPlay);
              audio.removeEventListener('error', onError);
              resolve();
            };
            
            const onError = (e) => {
              clearTimeout(timeout);
              audio.removeEventListener('canplay', onCanPlay);
              audio.removeEventListener('error', onError);
              reject(new Error('Audio loading error: ' + e.message));
            };
            
            audio.addEventListener('canplay', onCanPlay);
            audio.addEventListener('error', onError);
            
            // Принудительно загружаем аудио
            audio.load();
          });
        }
        
        // Устанавливаем время начала отрезка
        audio.currentTime = segmentStart;
        console.log('Set currentTime to:', segmentStart);
        
        // Запускаем воспроизведение
        const playPromise = audio.play();
        console.log('Play promise created');
        
        if (playPromise !== undefined) {
          await playPromise;
          console.log('Play promise resolved');
        }
        
        setIsPlaying(true);
        console.log('Playback started successfully');
      }
    } catch (error) {
      console.error('Playback error:', error);
      setIsPlaying(false);
      
      // Более детальная информация об ошибке
      let errorMessage = error.message;
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Браузер заблокировал автовоспроизведение. Попробуйте кликнуть на страницу и повторить.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Формат аудио не поддерживается браузером.';
      }
      
      alert(`Ошибка воспроизведения: ${errorMessage}`);
    }
  };

  // Обновление текущего времени
  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;

    const currentAudioTime = audio.currentTime;
    setCurrentTime(currentAudioTime);
    
    // Останавливаем воспроизведение на конце выделенного отрезка
    if (currentAudioTime >= segmentEnd) {
      audio.pause();
      setIsPlaying(false);
      // Возвращаем к началу отрезка
      setTimeout(() => {
        if (audio) {
          audio.currentTime = segmentStart;
        }
      }, 100);
      console.log('Playback stopped at segment end');
    }
  };

  // Обработка ошибок аудио
  const handleAudioError = (e) => {
    console.error('Audio error:', e);
    console.error('Audio error details:', {
      error: e.target?.error,
      networkState: e.target?.networkState,
      readyState: e.target?.readyState,
      src: e.target?.src
    });
    setIsPlaying(false);
    
    // Показываем более понятное сообщение об ошибке
    const errorCode = e.target?.error?.code;
    let errorMessage = 'Неизвестная ошибка аудио';
    
    switch (errorCode) {
      case 1: // MEDIA_ERR_ABORTED
        errorMessage = 'Загрузка аудио была прервана';
        break;
      case 2: // MEDIA_ERR_NETWORK
        errorMessage = 'Ошибка сети при загрузке аудио';
        break;
      case 3: // MEDIA_ERR_DECODE
        errorMessage = 'Ошибка декодирования аудио файла';
        break;
      case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
        errorMessage = 'Формат аудио файла не поддерживается';
        break;
    }
    
    alert(`Ошибка аудио: ${errorMessage}`);
  };

  // Обработка загрузки аудио
  const handleAudioLoaded = () => {
    console.log('Audio loaded and ready');
    const audio = audioRef.current;
    if (audio) {
      console.log('Audio ready state:', audio.readyState);
      console.log('Audio duration:', audio.duration);
      console.log('Audio src:', audio.src);
    }
  };

  // Применение изменений
  const handleApply = () => {
    onTrimChange({
      startTime: segmentStart,
      endTime: segmentEnd,
      duration: segmentDuration
    });
    onClose();
  };

  // Перерисовка при изменении выделения (только selection, не waveform)
  useEffect(() => {
    if (audioBuffer && duration > 0) {
      redrawCanvas();
    }
  }, [segmentStart]); // Только при изменении позиции отрезка

  // Перерисовка при воспроизведении (чаще, но только selection)
  useEffect(() => {
    if (isPlaying && audioBuffer) {
      const interval = setInterval(() => {
        redrawCanvas();
      }, 100); // Обновляем каждые 100мс
      
      return () => clearInterval(interval);
    }
  }, [isPlaying, audioBuffer]);

  // Очистка URL объекта при закрытии
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio && audio.src && audio.src.startsWith('blob:')) {
        console.log('Cleaning up audio URL:', audio.src);
        URL.revokeObjectURL(audio.src);
      }
    };
  }, [audioFile]); // Зависимость от audioFile для пересоздания при смене файла

  if (!isOpen) return null;

  return (
    <div className="audio-trimmer-overlay">
      <div className="audio-trimmer">
        <div className="audio-trimmer-header">
          <h2>Выбор отрывка трека</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="audio-trimmer-content">
          <div className="segment-info">
            <h3>Выбор отрывка трека</h3>
            <p>
              Отрезок зафиксирован на <strong>{segmentDuration} секунд</strong> (длительность видео).
              Перетащите выделенную область, чтобы выбрать нужный фрагмент трека.
            </p>
            <div className="subtitle-info">
              <p style={{ 
                color: 'var(--success)', 
                fontSize: '0.9rem', 
                margin: '0.5rem 0 0 0',
                fontWeight: '600'
              }}>
                📝 <strong>Совет:</strong> После выбора отрезка откройте редактор субтитров для создания текста под музыку.
              </p>
            </div>
          </div>

          <div className="waveform-container">
            <canvas
              ref={canvasRef}
              width={800}
              height={200}
              className="waveform-canvas"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
            />
            <div className="waveform-info">
              <span>Общая длительность трека: {duration.toFixed(1)} сек</span>
              <span>Выбранный отрезок: {segmentStart.toFixed(1)} - {segmentEnd.toFixed(1)} сек</span>
              <span className="success">Длительность отрезка: {segmentDuration} сек</span>
            </div>
          </div>

          <div className="audio-controls">
            <button className="btn btn-play" onClick={togglePlayback}>
              {isPlaying ? '⏸ Остановить' : '▶ Прослушать отрезок'}
            </button>
            
            <button 
              className="btn btn-test-audio" 
              onClick={() => {
                const audio = audioRef.current;
                if (audio) {
                  audio.currentTime = 0;
                  audio.play().catch(e => console.log('Test play failed:', e));
                }
              }}
              style={{ 
                background: 'var(--bg-elevated)', 
                color: 'var(--text-muted)', 
                fontSize: '0.9rem',
                padding: '0.5rem 1rem'
              }}
            >
              🔊 Тест звука
            </button>
            
            <div className="debug-info">
              <small>
                Аудио готово: {audioRef.current?.readyState >= 2 ? '✓' : '✗'} | 
                Текущее время: {currentTime.toFixed(1)}с |
                Отрезок: {segmentStart.toFixed(1)}-{segmentEnd.toFixed(1)}с
              </small>
            </div>
            
            <div className="segment-position">
              <label>
                Позиция отрезка:
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, duration - segmentDuration)}
                  step="0.1"
                  value={segmentStart}
                  onChange={(e) => setSegmentStart(parseFloat(e.target.value))}
                  className="position-slider"
                />
                <span>{segmentStart.toFixed(1)} сек</span>
              </label>
            </div>
          </div>

          <div className="audio-trimmer-actions">
            <button className="btn btn-cancel" onClick={onClose}>
              Отмена
            </button>
            <button className="btn btn-apply" onClick={handleApply}>
              ✓ Использовать этот отрезок
            </button>
          </div>
        </div>

        <audio
          ref={audioRef}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          onError={handleAudioError}
          onCanPlay={handleAudioLoaded}
          onLoadedData={() => console.log('Audio data loaded')}
          onLoadedMetadata={() => console.log('Audio metadata loaded')}
          preload="auto"
          crossOrigin="anonymous"
        />
      </div>
    </div>
  );
}

export default AudioTrimmer;