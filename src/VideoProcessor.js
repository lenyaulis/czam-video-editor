import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
const INPUT_VIDEO = "input.mp4";
const INPUT_SONG = "song.mp3";
const SUBTITLE_IMAGE = "subtitle.png";
const OUTPUT_VIDEO = "output.mp4";

let ffmpegInstance = null;

/**
 * Создает PNG изображение с субтитрами для определенного временного интервала
 * @param {Array} subtitles - массив субтитров
 * @param {number} startTime - начальное время интервала
 * @param {number} endTime - конечное время интервала
 * @param {string} font - название шрифта
 * @param {number} fontSize - размер шрифта
 * @param {number} width - ширина изображения
 * @param {number} height - высота изображения
 * @returns {Uint8Array} PNG данные
 */
function createSubtitleImageForInterval(subtitles, startTime, endTime, font, fontSize, width = 1280, height = 720) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  // Прозрачный фон
  ctx.clearRect(0, 0, width, height);
  
  // Находим активные субтитры для данного временного интервала
  const activeSubtitles = subtitles.filter(sub => 
    sub.text && sub.text.trim() &&
    ((sub.startTime <= startTime && sub.endTime >= startTime) ||
     (sub.startTime <= endTime && sub.endTime >= endTime) ||
     (sub.startTime >= startTime && sub.endTime <= endTime))
  );
  
  if (activeSubtitles.length === 0) {
    // Возвращаем прозрачное изображение
    const dataURL = canvas.toDataURL('image/png');
    const base64 = dataURL.split(',')[1];
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  
  // Настройки текста
  const bestFont = getBestAvailableFont(font);
  ctx.font = `bold ${fontSize}px ${bestFont}`;
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = Math.max(3, fontSize / 16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  console.log(`Creating subtitle image with font: bold ${fontSize}px ${bestFont}`);
  
  // Позиция текста (по центру, внизу)
  const x = width / 2;
  const lineHeight = fontSize + 15;
  const totalHeight = activeSubtitles.length * lineHeight;
  const startY = height - 120 - totalHeight / 2;
  
  // Рисуем каждый активный субтитр
  activeSubtitles.forEach((subtitle, index) => {
    const y = startY + (index * lineHeight);
    
    // Рисуем обводку и текст
    ctx.strokeText(subtitle.text, x, y);
    ctx.fillText(subtitle.text, x, y);
  });
  
  // Конвертируем в PNG
  const dataURL = canvas.toDataURL('image/png');
  const base64 = dataURL.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes;
}

/**
 * Получает лучший доступный шрифт с fallback
 * @param {string} fontValue - значение шрифта с fallback
 * @returns {string} лучший доступный шрифт
 */
function getBestAvailableFont(fontValue) {
  // Проверяем доступность шрифта
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  const testText = 'abcdefghijklmnopqrstuvwxyz0123456789';
  
  // Измеряем с fallback шрифтом
  context.font = '72px sans-serif';
  const fallbackWidth = context.measureText(testText).width;
  
  // Измеряем с нужным шрифтом
  context.font = `72px ${fontValue}`;
  const testWidth = context.measureText(testText).width;
  
  // Если ширина отличается значительно, значит шрифт загружен
  if (Math.abs(testWidth - fallbackWidth) > 5) {
    return fontValue;
  }
  
  // Возвращаем fallback
  return 'Arial, sans-serif';
}

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}
/**
 * Обрабатывает видео: замена аудио на song, наложение субтитров.
 * @param {Object} opts
 * @param {File[]} opts.videos — массив видео .mp4
 * @param {File} opts.song — файл песни .mp3
 * @param {Object} opts.subtitleConfig — конфигурация субтитров (опционально)
 * @param {Object} opts.audioTrimConfig — конфигурация обрезки аудио (опционально)
 * @param {function(string, number)} opts.setProgress — (имя, 0..1)
 * @param {function(string, Blob)} opts.setResult — (имя, blob)
 * @param {function(string, *)} opts.setError — (имя, err)
 */
export async function processVideos({ videos, song, subtitleConfig, audioTrimConfig, setProgress, setResult, setError }) {
  const ffmpeg = await getFFmpeg();

  const songData = await fetchFile(song);
  await ffmpeg.writeFile(INPUT_SONG, songData);

  // Проверяем наличие субтитров
  const hasSubtitles = subtitleConfig && subtitleConfig.subtitles && subtitleConfig.subtitles.length > 0;
  
  // Создаем изображения с субтитрами для разных временных интервалов
  if (hasSubtitles) {
    // Упрощенный подход: создаем изображения только для каждого субтитра
    for (let i = 0; i < subtitleConfig.subtitles.length; i++) {
      const subtitle = subtitleConfig.subtitles[i];
      if (!subtitle.text || !subtitle.text.trim()) continue;
      
      const imageData = createSubtitleImageForInterval(
        [subtitle], // Только один субтитр за раз
        subtitle.startTime,
        subtitle.endTime,
        subtitleConfig.font,
        subtitleConfig.fontSize
      );
      
      const imageName = `sub${i}.png`;
      await ffmpeg.writeFile(imageName, imageData);
      console.log(`Created subtitle image: ${imageName} for "${subtitle.text}" (${subtitle.startTime}-${subtitle.endTime}s)`);
    }
  }

  let currentName = null;
  const onProgress = ({ progress }) => {
    if (currentName != null && typeof setProgress === "function") {
      setProgress(currentName, Math.min(1, Math.max(0, progress)));
    }
  };
  ffmpeg.on("progress", onProgress);

  for (const video of videos) {
    const name = video.name;
    currentName = name;
    setProgress(name, 0);

    try {
      await ffmpeg.writeFile(INPUT_VIDEO, await fetchFile(video));
      console.log("Video file written successfully:", name);
      
      // Команда FFmpeg
      let ffmpegArgs = [
        "-i", INPUT_VIDEO,
      ];
      
      // Добавляем аудио с возможной обрезкой
      if (audioTrimConfig) {
        ffmpegArgs.push(
          "-ss", audioTrimConfig.startTime.toString(),
          "-t", audioTrimConfig.duration.toString(),
          "-i", INPUT_SONG
        );
        console.log(`Using audio trim: ${audioTrimConfig.startTime}s - ${audioTrimConfig.endTime}s (duration: ${audioTrimConfig.duration}s)`);
      } else {
        ffmpegArgs.push("-i", INPUT_SONG);
      }
      
      if (hasSubtitles) {
        // Добавляем все изображения субтитров как входы
        const validSubtitles = subtitleConfig.subtitles.filter(sub => sub.text && sub.text.trim());
        console.log("Valid subtitles:", validSubtitles.length);
        
        if (validSubtitles.length > 0) {
          validSubtitles.forEach((_, index) => {
            ffmpegArgs.push("-i", `sub${index}.png`);
          });
          
          // Создаем фильтр для любого количества субтитров
          if (validSubtitles.length === 1) {
            // Один субтитр
            const sub = validSubtitles[0];
            ffmpegArgs.push(
              "-filter_complex", `[0:v][2:v]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2:enable='between(t,${sub.startTime},${sub.endTime})'[v]`,
              "-map", "[v]",
              "-map", "1:a:0"
            );
          } else {
            // Множественные субтитры - создаем цепочку overlay
            let filterComplex = "";
            let currentInput = "[0:v]";
            
            validSubtitles.forEach((sub, index) => {
              const inputIndex = index + 2; // +2 потому что 0=видео, 1=аудио
              const isLast = index === validSubtitles.length - 1;
              const outputLabel = isLast ? "[v]" : `[tmp${index}]`;
              
              if (index > 0) {
                filterComplex += ";";
                currentInput = `[tmp${index - 1}]`;
              }
              
              filterComplex += `${currentInput}[${inputIndex}:v]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2:enable='between(t,${sub.startTime},${sub.endTime})'${outputLabel}`;
            });
            
            ffmpegArgs.push(
              "-filter_complex", filterComplex,
              "-map", "[v]",
              "-map", "1:a:0"
            );
            
            console.log("Filter complex for multiple subtitles:", filterComplex);
          }
          
          ffmpegArgs.push(
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "28",
            "-c:a", "aac",
            "-b:a", "128k",
            "-shortest"
          );
          
          console.log("Processing with timed subtitle overlays");
        } else {
          // Нет валидных субтитров, обрабатываем без них
          ffmpegArgs.push(
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "128k",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-shortest"
          );
          console.log("No valid subtitles, processing without subtitles");
        }
      } else {
        // Без субтитров - быстрое копирование
        ffmpegArgs.push(
          "-c:v", "copy",
          "-c:a", "aac",
          "-b:a", "128k",
          "-map", "0:v:0",
          "-map", "1:a:0",
          "-shortest"
        );
        console.log("Processing without subtitles");
      }
      
      ffmpegArgs.push(OUTPUT_VIDEO);
      
      console.log("FFmpeg command:", ffmpegArgs.join(' '));
      await ffmpeg.exec(ffmpegArgs);
      
      const data = await ffmpeg.readFile(OUTPUT_VIDEO);
      const blob = new Blob([data], { type: "video/mp4" });
      setProgress(name, 1);
      setResult(name, blob);

      // Очистка файлов
      try {
        await ffmpeg.deleteFile(INPUT_VIDEO);
        await ffmpeg.deleteFile(OUTPUT_VIDEO);
        // Удаляем изображения субтитров
        if (hasSubtitles) {
          const validSubtitles = subtitleConfig.subtitles.filter(sub => sub.text && sub.text.trim());
          for (let i = 0; i < validSubtitles.length; i++) {
            try {
              await ffmpeg.deleteFile(`sub${i}.png`);
            } catch (_) {}
          }
        }
      } catch (_) {}
      
      console.log("Successfully processed:", name);
    } catch (err) {
      console.error("FFmpeg error for", name, ":", err);
      setError(name, err);
    }
  }

  ffmpeg.off("progress", onProgress);
  currentName = null;

  try {
    await ffmpeg.deleteFile(INPUT_SONG);
    // Удаляем изображения субтитров
    if (hasSubtitles) {
      const validSubtitles = subtitleConfig.subtitles.filter(sub => sub.text && sub.text.trim());
      for (let i = 0; i < validSubtitles.length; i++) {
        try {
          await ffmpeg.deleteFile(`sub${i}.png`);
        } catch (_) {}
      }
    }
  } catch (_) {}
}
