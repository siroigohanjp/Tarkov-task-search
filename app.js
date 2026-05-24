const uploadInput = document.getElementById('uploadInput');
const uploadButton = document.getElementById('uploadButton');
const selectFolderButton = document.getElementById('selectFolder');
const refreshFolderButton = document.getElementById('refreshFolder');
const openDefaultPathButton = document.getElementById('openDefaultPath');
const defaultPathInput = document.getElementById('defaultPath');
const watchStatus = document.getElementById('watchStatus');
const previewArea = document.getElementById('previewArea');
const statusLog = document.getElementById('statusLog');
const taskResults = document.getElementById('taskResults');

let directoryHandle = null;
let knownFiles = new Set();
let watcherInterval = null;

const allowedExt = ['.png', '.jpg', '.jpeg', '.bmp', '.webp'];

function logMessage(message, type = 'info') {
  const item = document.createElement('div');
  item.className = `log-item ${type}`;
  item.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
  statusLog.prepend(item);
}

function normalizeText(text) {
  return text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\r/g, '\n').trim();
}

function extractCandidates(fullText, words) {
  // 単語位置情報があればそれを使い、横方向の近さで同列判定して結合する
  if (words && words.length) {
    const items = words.map(w => {
      // tesseract.js の出力差異に対応
      const bx = w.bbox || {};
      const x0 = (typeof bx.x0 === 'number') ? bx.x0 : (w.x0 || w.x || 0);
      const x1 = (typeof bx.x1 === 'number') ? bx.x1 : (w.x1 || ((w.x || 0) + (w.w || 0)));
      const y0 = (typeof bx.y0 === 'number') ? bx.y0 : (w.y0 || w.y || 0);
      const y1 = (typeof bx.y1 === 'number') ? bx.y1 : (w.y1 || ((w.y || 0) + (w.h || 0)));
      const txt = (w.text || w.word || '').trim();
      return { txt, x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.max(1, x1 - x0) };
    }).filter(i => i.txt.length > 0);

    if (items.length === 0) return [];

    // 行単位でクラスタリング（Yの近さ）
    items.sort((a, b) => a.cy - b.cy);
    const rows = [];
    const medianH = (() => {
      const hs = items.map(i => i.y1 - i.y0).sort((a,b)=>a-b);
      return hs[Math.floor(hs.length/2)] || 16;
    })();
    const rowThresh = Math.max(8, medianH * 1.5);

    for (const it of items) {
      const row = rows.find(r => Math.abs(r.avgY - it.cy) <= rowThresh);
      if (row) {
        row.items.push(it);
        row.avgY = row.items.reduce((s,x)=>s+x.cy,0)/row.items.length;
      } else {
        rows.push({ items: [it], avgY: it.cy });
      }
    }

    const candidates = [];
    for (const r of rows) {
      r.items.sort((a,b)=>a.cx-b.cx);
      // 横方向でギャップが大きければ別カラムとみなす
      const gaps = [];
      for (let i=0;i<r.items.length-1;i++) gaps.push(r.items[i+1].x0 - r.items[i].x1);
      const medianGap = gaps.length ? gaps.sort((a,b)=>a-b)[Math.floor(gaps.length/2)] : 0;
      const gapThresh = Math.max(6, medianGap || (medianH * 0.8));

      let group = [r.items[0]];
      for (let i=1;i<r.items.length;i++) {
        const cur = r.items[i];
        const prev = r.items[i-1];
        const gap = cur.x0 - prev.x1;
        if (gap <= gapThresh) {
          group.push(cur);
        } else {
          candidates.push(group.map(x=>x.txt).join(' '));
          group = [cur];
        }
      }
      if (group.length) candidates.push(group.map(x=>x.txt).join(' '));
    }

    const ignorePattern = /^(LEVEL|EXP|RANK|TIME|REWARD|PRICE|WEIGHT|ARMOR|WEAPON|HP|MP|DUR)$/i;
    return [...new Set(candidates.map(s=>s.trim()).filter(s=>s.length>2 && !ignorePattern.test(s)))].slice(0, 10);
  }

  // 位置情報がなければ旧来のテキストベース処理にフォールバック
  let lines = normalizeText(fullText)
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // マージ: 短い隣接行を結合
  const merged = [];
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i];
    const b = lines[i + 1];
    if (b && a.length <= 15 && b.length <= 15) {
      merged.push((a + ' ' + b).trim());
      i++; // skip next line
    } else {
      merged.push(a);
    }
  }

  lines = merged.filter(line => line.length > 3);
  const ignorePattern = /^(LEVEL|EXP|RANK|TIME|REWARD|PRICE|WEIGHT|ARMOR|WEAPON|HP|MP|DUR)$/i;
  const candidates = lines.filter(line => !ignorePattern.test(line));
  return [...new Set(candidates)].slice(0, 10);
}

function buildSearchItems(taskName) {
  return [
    { name: 'Google', url: `https://www.google.com/search?q=${encodeURIComponent(taskName + ' escape from tarkov')}` },
    { name: 'Bing', url: `https://www.bing.com/search?q=${encodeURIComponent(taskName + ' escape from tarkov')}` },
    { name: 'EFT Wiki', url: `https://escapefromtarkov.fandom.com/wiki/Special:Search?search=${encodeURIComponent(taskName)}` }
  ];
}

function renderTasks(data) {
  const section = document.createElement('section');
  section.className = 'task-section';

  const title = document.createElement('h3');
  title.textContent = data.file;
  section.appendChild(title);

  const pre = document.createElement('pre');
  pre.className = 'ocr-text';
  pre.textContent = data.fullText.trim() || 'テキストが見つかりませんでした。';
  section.appendChild(pre);

  if (data.tasks.length === 0) {
    const message = document.createElement('p');
    message.textContent = 'タスク候補が見つかりませんでした。';
    section.appendChild(message);
  } else {
    data.tasks.forEach(item => {
      const panel = document.createElement('div');
      panel.className = 'task-item';
      const taskTitle = document.createElement('h4');
      taskTitle.textContent = item.task;
      panel.appendChild(taskTitle);

      const actions = document.createElement('div');
      actions.className = 'search-links';
      item.searches.forEach(search => {
        const link = document.createElement('a');
        link.href = search.url;
        link.textContent = search.name;
        link.target = '_blank';
        actions.appendChild(link);
      });
      panel.appendChild(actions);
      section.appendChild(panel);
    });
  }

  taskResults.prepend(section);
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function cropTaskColumn(file) {
  const dataUrl = await fileToDataURL(file);
  const img = await loadImage(dataUrl);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  // 赤い範囲に合わせ、左端のアイコン列と右端の場所列を除外して正確にタスク名列だけを切り出す
  const cropX = Math.round(width * 0.10);
  const cropY = Math.round(height * 0.14);
  const cropWidth = Math.round(width * 0.16);
  const cropHeight = Math.round(height * 0.55);

  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return canvas;
}

async function recognizeImage(source, label) {
  logMessage(`${label} をOCR解析中...`);
  const result = await Tesseract.recognize(source, 'jpn+eng', {
    logger: m => {
      if (m.status === 'recognizing text') {
        logMessage(`${label}: OCR進捗 ${Math.round(m.progress * 100)}%`);
      }
    }
  });
  const text = result.data && result.data.text ? result.data.text : '';
  const words = (result.data && (result.data.words || result.data.symbols)) ? (result.data.words || result.data.symbols) : [];
  return { text, words };
}

function showSearchPreview(fileName, src) {
  previewArea.innerHTML = `
    <div class="preview-header">
      <strong>検索対象プレビュー:</strong> ${fileName}
    </div>
    <img src="${src}" alt="検索対象プレビュー" />
    <p>この画像の範囲をOCRしてタスク名を検索します。</p>
  `;
}

async function processImageFile(file) {
  try {
    const croppedCanvas = await cropTaskColumn(file);
    showSearchPreview(file.name, croppedCanvas.toDataURL());
    const ocr = await recognizeImage(croppedCanvas, file.name);
    const text = ocr.text;
    const words = ocr.words || [];
    const candidates = extractCandidates(text, words);
    const tasks = candidates.map(task => ({ task, searches: buildSearchItems(task) }));
    renderTasks({ file: file.name, fullText: text, tasks });
    logMessage(`${file.name} の解析完了`);
  } catch (error) {
    logMessage(`${file.name} の解析に失敗しました: ${error.message}`, 'error');
  }
}

async function scanDirectory() {
  if (!directoryHandle) return;
  try {
    const newFiles = [];
    for await (const [name, handle] of directoryHandle.entries()) {
      if (handle.kind !== 'file') continue;
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
      if (!allowedExt.includes(ext)) continue;
      if (knownFiles.has(name)) continue;
      knownFiles.add(name);
      newFiles.push(name);
      const file = await handle.getFile();
      processImageFile(file);
    }
    if (newFiles.length) {
      logMessage(`新しい画像を検出しました: ${newFiles.join(', ')}`);
    }
  } catch (error) {
    logMessage(`フォルダの読み込みに失敗しました: ${error.message}`, 'error');
  }
}

async function selectFolder() {
  try {
    directoryHandle = await window.showDirectoryPicker({ id: "tarkov-screenshots" });
    knownFiles.clear();
    watchStatus.textContent = `監視フォルダ: ${directoryHandle.name}`;
    refreshFolderButton.disabled = false;
    await scanDirectory();
    if (watcherInterval) clearInterval(watcherInterval);
    watcherInterval = setInterval(scanDirectory, 5000);
  } catch (error) {
    logMessage(`フォルダ選択がキャンセルされました。`, 'warning');
  }
}

async function openDefaultPath() {
  const path = defaultPathInput.value.trim();
  if (!path) {
    logMessage('パスを入力してください。', 'warning');
    return;
  }
  try {
    const rootHandle = await window.showDirectoryPicker();
    const dirHandle = await rootHandle.getDirectoryHandle(path, { createDirectory: false });
    directoryHandle = dirHandle;
    knownFiles.clear();
    watchStatus.textContent = `監視フォルダ: ${path}`;
    refreshFolderButton.disabled = false;
    await scanDirectory();
    if (watcherInterval) clearInterval(watcherInterval);
    watcherInterval = setInterval(scanDirectory, 5000);
  } catch (error) {
    logMessage(`フォルダのオープンに失敗しました: ${error.message}`, 'error');
  }
}

selectFolderButton.addEventListener('click', selectFolder);
refreshFolderButton.addEventListener('click', scanDirectory);
openDefaultPathButton.addEventListener('click', openDefaultPath);

uploadButton.addEventListener('click', async () => {
  if (!uploadInput.files.length) {
    logMessage('スクショファイルを選択してください。', 'warning');
    return;
  }
  uploadButton.disabled = true;
  uploadButton.innerText = '解析中...';
  for (const file of uploadInput.files) {
    await processImageFile(file);
  }
  uploadButton.disabled = false;
  uploadButton.innerText = '解析する';
});

window.addEventListener('DOMContentLoaded', () => {
  watchStatus.textContent = '「フォルダを選択」でスクショ保存先を指定してください。';
});
