const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const state = {
    library: [],
    activeTool: 0,
    tools: [
        { color: '#000000', weight: 3, type: 'pen' },
        { color: '#0000ff', weight: 3, type: 'pen' },
        { color: '#ff0000', weight: 3, type: 'pen' },
        { color: '#ffff00', weight: 25, type: 'highlighter' }
    ],
    isCollapsed: false
};

const penColors = ['#add8e6', '#00008b', '#000000', '#ff0000', '#90ee90', '#006400', '#e6e6fa', '#800080', '#ffa500', '#40e0d0'];
const highColors = ['#ffff00', '#ffa500', '#90ee90', '#add8e6', '#ffc0cb'];

// --- Library Management ---
document.getElementById('pdf-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdfDoc.getPage(1);
    
    const canvas = document.createElement('canvas');
    const viewport = page.getViewport({ scale: 0.3 });
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    state.library.push({ id: Date.now(), name: file.name, data: arrayBuffer, isBlank: false, thumbnail: canvas.toDataURL() });
    renderLibrary();
});

function createNewBlank() {
    const name = prompt("Document Name:", "New Notebook");
    if (!name) return;
    state.library.push({ id: Date.now(), name: name, data: null, isBlank: true, thumbnail: "" });
    renderLibrary();
    openEditor(state.library[state.library.length-1]);
}

function renderLibrary() {
    const grid = document.getElementById('file-grid');
    grid.innerHTML = '';
    state.library.forEach(doc => {
        const card = document.createElement('div');
        card.className = 'pdf-card';
        card.onclick = () => openEditor(doc);
        const thumb = doc.isBlank ? `<div style="background:white;height:100%"></div>` : `<img src="${doc.thumbnail}">`;
        card.innerHTML = `<div class="preview-container">${thumb}</div><div class="file-name">${doc.name}</div>`;
        grid.appendChild(card);
    });
}

// --- Editor Logic ---
async function openEditor(doc) {
    document.getElementById('library-view').classList.add('hidden');
    document.getElementById('editor-view').classList.remove('hidden');
    const container = document.getElementById('document-container');
    container.innerHTML = '';

    if (doc.isBlank) {
        createPage(container, 816, 1056);
    } else {
        const pdfDoc = await pdfjsLib.getDocument({ data: doc.data }).promise;
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getPageViewport({ scale: 1.5 });
            const { bg } = createPage(container, viewport.width, viewport.height);
            await page.render({ canvasContext: bg.getContext('2d'), viewport }).promise;
        }
    }
    selectTool(0);
}

function createPage(container, w, h) {
    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.style.width = w + 'px'; wrapper.style.height = h + 'px';
    const bg = document.createElement('canvas'); bg.width = w; bg.height = h;
    const fg = document.createElement('canvas'); fg.className = 'draw-layer'; fg.width = w; fg.height = h;
    wrapper.appendChild(bg); wrapper.appendChild(fg);
    container.appendChild(wrapper);
    initDrawing(fg);
    return { bg, fg };
}

// --- Drawing Engine ---
function initDrawing(canvas) {
    const ctx = canvas.getContext('2d');
    let isDrawing = false, points = [];

    canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'pen' && e.buttons !== 1) return;
        isDrawing = true;
        const tool = state.tools[state.activeTool];
        ctx.strokeStyle = tool.type === 'highlighter' ? tool.color + '77' : tool.color;
        ctx.lineWidth = tool.weight;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = tool.type === 'highlighter' ? 'multiply' : 'source-over';
        points = [{ x: e.offsetX, y: e.offsetY }];
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!isDrawing) return;
        points.push({ x: e.offsetX, y: e.offsetY });
        if (points.length > 2) {
            ctx.beginPath();
            ctx.moveTo(points[points.length-3].x, points[points.length-3].y);
            const mid = { x: (points[points.length-2].x + points[points.length-1].x)/2, y: (points[points.length-2].y + points[points.length-1].y)/2 };
            ctx.quadraticCurveTo(points[points.length-2].x, points[points.length-2].y, mid.x, mid.y);
            ctx.stroke();
        }
    });
    canvas.addEventListener('pointerup', () => isDrawing = false);
}

// --- UI Actions ---
function selectTool(i) {
    state.activeTool = i;
    document.querySelectorAll('.tool-btn').forEach((b, idx) => b.classList.toggle('active', idx === i));
    renderPalette();
    document.getElementById('weightSlider').value = state.tools[i].weight;
    document.getElementById('weightLabel').innerText = state.tools[i].weight + 'px';
}

function renderPalette() {
    const palette = document.getElementById('color-palette');
    palette.innerHTML = '';
    const colors = state.activeTool === 3 ? highColors : penColors;
    colors.forEach(c => {
        const s = document.createElement('div');
        s.className = 'color-swatch' + (state.tools[state.activeTool].color === c ? ' active' : '');
        s.style.backgroundColor = c;
        s.onclick = () => { state.tools[state.activeTool].color = c; renderPalette(); };
        palette.appendChild(s);
    });
}

document.getElementById('weightSlider').oninput = (e) => {
    state.tools[state.activeTool].weight = e.target.value;
    document.getElementById('weightLabel').innerText = e.target.value + 'px';
};

function showLibrary() {
    document.getElementById('library-view').classList.remove('hidden');
    document.getElementById('editor-view').classList.add('hidden');
}

function toggleMenu() {
    state.isCollapsed = !state.isCollapsed;
    document.getElementById('toolbar').classList.toggle('collapsed', state.isCollapsed);
    document.getElementById('menu-dot').classList.toggle('hidden', !state.isCollapsed);
}

// Infinite scroll for blank docs
document.getElementById('document-container').onscroll = (e) => {
    const el = e.target;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 10) {
        // If the current doc is blank, we can append pages
        const activeDoc = state.library.find(d => !document.getElementById('library-view').classList.contains('hidden'));
        // (Simplified for demo: appends to any document)
        createPage(el, 816, 1056);
    }
};
