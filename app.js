// 全局变量
let audioContext = null;
let analyser = null;
let microphone = null;
let dataArray = null;
let animationFrameId = null;
let isMonitoring = false;
let warningCount = 0;
let maxWarnings = 3;
let threshold = 80; // 默认80分贝
let mediaRecorder = null;
let audioChunks = [];
let videoChunks = [];
let audioStream = null;
let videoStream = null;
let combinedStream = null;
let db = null; // IndexedDB数据库实例
let isRecording = false; // 是否正在录制
let lastWarningTime = 0; // 上次警告时间
let warningCooldown = 2000; // 警告冷却时间（毫秒）
let recordingStopDelay = 5000; // 分贝恢复后等待多久自动停止录制（毫秒）
let releaseMargin = 5; // 低于阈值多少dB视为恢复
let stopRecordingTimer = null; // 自动停止录制的定时器

let currentClassroom = null;

// AI模块
let noiseClassifier = null;
let thresholdRecommender = null;
let efficiencyAnalyzer = null;
let currentNoiseType = null;
let noiseTypeUpdateInterval = null;

// DOM元素
const decibelDisplay = document.getElementById('decibelDisplay');
const warningCountEl = document.getElementById('warningCount');
const monitorStatus = document.getElementById('monitorStatus');
const levelFill = document.getElementById('levelFill');
const waveformCanvas = document.getElementById('waveformCanvas');
const alertContainer = document.getElementById('alertContainer');
const recordingPanel = document.getElementById('recordingPanel');
const videoPreview = document.getElementById('videoPreview');
const downloadPanel = document.getElementById('downloadPanel');
const downloadAudio = document.getElementById('downloadAudio');
const downloadVideo = document.getElementById('downloadVideo');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const stopRecordingBtn = document.getElementById('stopRecordingBtn');
const thresholdInput = document.getElementById('thresholdInput');
const maxWarningsInput = document.getElementById('maxWarningsInput');
const releaseMarginInput = document.getElementById('releaseMarginInput');
const stopDelayInput = document.getElementById('stopDelayInput');
const historyList = document.getElementById('historyList');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const historySearch = document.getElementById('historySearch');
const notifyBtn = document.getElementById('notifyBtn');
const noteInput = document.getElementById('noteInput');

// 初始化Canvas
const canvasCtx = waveformCanvas.getContext('2d');
waveformCanvas.width = waveformCanvas.offsetWidth;
waveformCanvas.height = 200;

// 事件监听
startBtn.addEventListener('click', startMonitoring);
stopBtn.addEventListener('click', stopMonitoring);
resetBtn.addEventListener('click', resetWarnings);
stopRecordingBtn.addEventListener('click', stopRecording);
refreshHistoryBtn.addEventListener('click', () => loadHistory(historySearch.value.trim()));
clearHistoryBtn.addEventListener('click', clearAllHistory);
exportCsvBtn.addEventListener('click', exportHistoryCsv);
historySearch.addEventListener('input', () => loadHistory(historySearch.value.trim()));
notifyBtn.addEventListener('click', requestNotificationPermission);
thresholdInput.addEventListener('change', (e) => {
    threshold = parseInt(e.target.value);
});
maxWarningsInput.addEventListener('change', (e) => {
    maxWarnings = parseInt(e.target.value);
});
releaseMarginInput.addEventListener('change', (e) => {
    releaseMargin = parseInt(e.target.value);
});
stopDelayInput.addEventListener('change', (e) => {
    recordingStopDelay = parseInt(e.target.value);
});

// 初始化AI模块
async function initAI() {
    try {
        noiseClassifier = new NoiseClassifier();
        await noiseClassifier.init();
        
        thresholdRecommender = new SmartThresholdRecommender();
        efficiencyAnalyzer = new LearningEfficiencyAnalyzer();
        
        // 初始化AI功能按钮事件
        initAIEventListeners();
        
        console.log('AI模块初始化完成');
    } catch (error) {
        console.error('AI模块初始化失败:', error);
    }
}

// 初始化AI事件监听
function initAIEventListeners() {
    const smartThresholdBtn = document.getElementById('smartThresholdBtn');
    const generateReportBtn = document.getElementById('generateReportBtn');
    const learningAnalysisBtn = document.getElementById('learningAnalysisBtn');
    const applySmartThreshold = document.getElementById('applySmartThreshold');
    
    if (smartThresholdBtn) {
        smartThresholdBtn.addEventListener('click', async () => {
            await recommendSmartThreshold();
        });
    }
    
    if (generateReportBtn) {
        generateReportBtn.addEventListener('click', async () => {
            await generateDisciplineReport();
        });
    }
    
    if (learningAnalysisBtn) {
        learningAnalysisBtn.addEventListener('click', async () => {
            await analyzeLearningEfficiency();
        });
    }
    
    if (applySmartThreshold) {
        applySmartThreshold.addEventListener('click', () => {
            const recommended = document.getElementById('smartThresholdValue').textContent;
            if (recommended && recommended !== '--') {
                const value = parseInt(recommended);
                thresholdInput.value = value;
                threshold = value;
                showAlert(`已应用推荐阈值: ${value}dB`, 'success');
                applySmartThreshold.style.display = 'none';
            }
        });
    }
}

// 智能阈值推荐
async function recommendSmartThreshold() {
    if (!thresholdRecommender || !db) {
        showAlert('系统未初始化', 'warning');
        return;
    }
    
    try {
        showAlert('正在分析历史数据...', 'info');
        await thresholdRecommender.loadHistoryData(db);
        
        const currentClassroomId = currentClassroom ? currentClassroom.id : null;
        const recommendation = thresholdRecommender.recommendThreshold(currentClassroomId, threshold);
        
        const resultDiv = document.getElementById('aiAnalysisResult');
        const smartThresholdValue = document.getElementById('smartThresholdValue');
        const applyBtn = document.getElementById('applySmartThreshold');
        
        if (smartThresholdValue) {
            smartThresholdValue.textContent = recommendation.recommended + 'dB';
        }
        
        if (resultDiv) {
            resultDiv.innerHTML = `
                <h4>智能阈值推荐结果</h4>
                <p><strong>推荐阈值:</strong> ${recommendation.recommended}dB</p>
                <p><strong>置信度:</strong> ${(recommendation.confidence * 100).toFixed(0)}%</p>
                <p><strong>分析说明:</strong> ${recommendation.reason}</p>
            `;
        }
        
        if (applyBtn && recommendation.recommended !== threshold) {
            applyBtn.style.display = 'inline-block';
        }
        
        showAlert('智能阈值推荐完成', 'success');
    } catch (error) {
        console.error('智能阈值推荐失败:', error);
        showAlert('智能阈值推荐失败: ' + error.message, 'danger');
    }
}

// 生成纪律报告
async function generateDisciplineReport() {
    if (!db) {
        showAlert('系统未初始化', 'warning');
        return;
    }
    
    try {
        showAlert('正在生成报告...', 'info');
        
        const transaction = db.transaction(['recordings'], 'readonly');
        const objectStore = transaction.objectStore('recordings');
        const index = objectStore.index('timestamp');
        const request = index.openCursor(null, 'prev');
        
        const classroomData = {};
        const totalRecords = [];
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) {
                // 生成报告
                const report = generateReportContent(classroomData, totalRecords);
                displayReport(report);
                showAlert('报告生成完成', 'success');
                return;
            }
            
            const recording = cursor.value;
            totalRecords.push(recording);
            
            const classroomName = recording.classroomName || '未指定班级';
            if (!classroomData[classroomName]) {
                classroomData[classroomName] = {
                    total: 0,
                    warnings: 0,
                    avgWarnings: 0,
                    maxWarnings: 0
                };
            }
            
            classroomData[classroomName].total++;
            classroomData[classroomName].warnings += recording.warningCount || 0;
            classroomData[classroomName].maxWarnings = Math.max(
                classroomData[classroomName].maxWarnings,
                recording.warningCount || 0
            );
            
            cursor.continue();
        };
        
        request.onerror = () => {
            showAlert('生成报告失败', 'danger');
        };
    } catch (error) {
        console.error('生成报告失败:', error);
        showAlert('生成报告失败: ' + error.message, 'danger');
    }
}

// 生成报告内容
function generateReportContent(classroomData, totalRecords) {
    const classrooms = Object.keys(classroomData);
    const totalCount = totalRecords.length;
    const totalWarnings = totalRecords.reduce((sum, r) => sum + (r.warningCount || 0), 0);
    const avgWarnings = totalCount > 0 ? (totalWarnings / totalCount).toFixed(2) : 0;
    
    let report = `<h4>📊 班级纪律报告</h4>`;
    report += `<p><strong>统计时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>`;
    report += `<p><strong>总录制次数:</strong> ${totalCount}</p>`;
    report += `<p><strong>平均警告次数:</strong> ${avgWarnings}</p>`;
    report += `<hr>`;
    report += `<h5>各班级详细数据:</h5>`;
    
    classrooms.forEach(className => {
        const data = classroomData[className];
        const avg = (data.warnings / data.total).toFixed(2);
        const level = avg < 1 ? '优秀' : avg < 2 ? '良好' : avg < 3 ? '一般' : '需改进';
        
        report += `<div style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 8px;">`;
        report += `<strong>${className}</strong><br>`;
        report += `录制次数: ${data.total} | 总警告: ${data.warnings} | 平均警告: ${avg} | 最高警告: ${data.maxWarnings}<br>`;
        report += `<span style="color: ${level === '优秀' ? '#27ae60' : level === '良好' ? '#3498db' : level === '一般' ? '#f39c12' : '#e74c3c'}">纪律水平: ${level}</span>`;
        report += `</div>`;
    });
    
    return report;
}

// 显示报告
function displayReport(report) {
    const resultDiv = document.getElementById('aiAnalysisResult');
    if (resultDiv) {
        resultDiv.innerHTML = report;
    }
}

// 学习效率分析
async function analyzeLearningEfficiency() {
    if (!efficiencyAnalyzer || !db) {
        showAlert('系统未初始化', 'warning');
        return;
    }
    
    try {
        showAlert('正在分析学习效率...', 'info');
        
        const currentClassroomId = currentClassroom ? currentClassroom.id : null;
        const analysis = await efficiencyAnalyzer.analyzeEfficiency(db, currentClassroomId);
        
        if (!analysis || !analysis.hasData) {
            showAlert('暂无足够数据进行分析', 'warning');
            return;
        }
        
        const resultDiv = document.getElementById('aiAnalysisResult');
        if (resultDiv) {
            let html = `<h4>📈 学习效率分析报告</h4>`;
            html += `<p><strong>分析记录数:</strong> ${analysis.totalRecords}</p>`;
            html += `<hr>`;
            html += `<h5>时间段分析:</h5>`;
            
            ['morning', 'afternoon', 'evening'].forEach(slot => {
                const slotData = analysis.timeSlotAnalysis[slot];
                html += `<div style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 8px;">`;
                html += `<strong>${slotData.label}</strong><br>`;
                html += `平均警告次数: ${slotData.avgWarnings} | 记录数: ${slotData.records}`;
                html += `</div>`;
            });
            
            html += `<hr>`;
            html += `<h5>趋势分析:</h5>`;
            html += `<p>噪音水平趋势: <strong>${analysis.trend === '上升' ? '⚠️ 上升' : analysis.trend === '下降' ? '✅ 下降' : '➡️ 稳定'}</strong></p>`;
            
            html += `<h5>最佳学习时段:</h5>`;
            html += `<p><strong>${analysis.bestTimeSlot.label}</strong> - 平均警告次数: ${analysis.bestTimeSlot.avgWarnings}</p>`;
            
            html += `<hr>`;
            html += `<h5>建议:</h5>`;
            html += `<ul>`;
            analysis.recommendations.forEach(rec => {
                html += `<li>${rec}</li>`;
            });
            html += `</ul>`;
            
            resultDiv.innerHTML = html;
        }
        
        showAlert('学习效率分析完成', 'success');
    } catch (error) {
        console.error('学习效率分析失败:', error);
        showAlert('学习效率分析失败: ' + error.message, 'danger');
    }
}

// 更新噪音类型显示
function updateNoiseType(audioData, sampleRate) {
    if (!noiseClassifier || !isMonitoring) return;
    
    try {
        const result = noiseClassifier.classifyAudioData(audioData, sampleRate);
        if (result) {
            currentNoiseType = result;
            const noiseTypeDisplay = document.getElementById('noiseTypeDisplay');
            const noiseTypeLabel = document.getElementById('noiseTypeLabel');
            
            if (noiseTypeDisplay) {
                noiseTypeDisplay.textContent = result.icon + ' ' + result.type;
            }
            if (noiseTypeLabel) {
                noiseTypeLabel.textContent = `置信度: ${(result.confidence * 100).toFixed(0)}%`;
            }
        }
    } catch (error) {
        console.error('噪音类型识别失败:', error);
    }
}

// 初始化IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('NoiseMonitorDB');
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            
            // 创建对象存储
            if (!database.objectStoreNames.contains('recordings')) {
                const objectStore = database.createObjectStore('recordings', { 
                    keyPath: 'id', 
                    autoIncrement: true 
                });
                
                // 创建索引以便按时间排序
                objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                objectStore.createIndex('date', 'date', { unique: false });
            }
        };
    });
}

// 保存录制文件到IndexedDB
async function saveRecording(audioBlob, videoBlob, metadata = {}) {
    if (!db) {
        await initDB();
    }
    
    return new Promise((resolve, reject) => {
        const timestamp = new Date().getTime();
        const date = new Date();
        const dateStr = date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const recording = {
            timestamp: timestamp,
            date: dateStr,
            dateObj: date.toISOString(),
            audioBlob: audioBlob,
            videoBlob: videoBlob,
            audioSize: audioBlob ? audioBlob.size : 0,
            videoSize: videoBlob ? videoBlob.size : 0,
            threshold: threshold,
            warningCount: warningCount,
            note: noteInput ? noteInput.value.trim() : '',
            ...metadata
        };
        
        const transaction = db.transaction(['recordings'], 'readwrite');
        const objectStore = transaction.objectStore('recordings');
        const request = objectStore.add(recording);
        
        request.onsuccess = () => {
            resolve(request.result);
            loadHistory(); // 刷新历史记录列表
        };
        
        request.onerror = () => reject(request.error);
    });
}

// 加载历史记录
async function loadHistory(keyword = '') {
    if (!db) {
        await initDB();
    }
    
    const transaction = db.transaction(['recordings'], 'readonly');
    const objectStore = transaction.objectStore('recordings');
    const index = objectStore.index('timestamp');
    const request = index.openCursor(null, 'prev'); // 降序排列，最新的在前
    
    historyList.innerHTML = '';
    
    request.onsuccess = (event) => {
        const cursor = event.target.result;
        
        if (!cursor) {
            if (historyList.children.length === 0) {
                historyList.innerHTML = '<div class="history-empty">暂无录制记录</div>';
            }
            return;
        }
        
        const recording = cursor.value;
        // 简单搜索：备注、时间字符串、阈值、警告次数
        const text = `${recording.note || ''} ${recording.date || ''} ${recording.threshold || ''} ${recording.warningCount || ''}`.toLowerCase();
        if (!keyword || text.includes(keyword.toLowerCase())) {
            const historyItem = createHistoryItem(recording);
            historyList.appendChild(historyItem);
        }
        
        cursor.continue();
    };
    
    request.onerror = () => {
        console.error('加载历史记录失败');
        historyList.innerHTML = '<div class="history-empty">加载失败</div>';
    };
}

// 创建历史记录项
function createHistoryItem(recording) {
    const item = document.createElement('div');
    item.className = 'history-item';
    
    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };
    
    item.innerHTML = `
        <div class="history-item-header">
            <div class="history-item-time">
                <span class="time-icon">🕐</span>
                <span class="time-text">${recording.date}</span>
            </div>
            <button class="btn-delete" data-id="${recording.id}" title="删除">🗑️</button>
        </div>
        ${recording.note ? `
        <div class="history-item-note">
            <span class="note-label">备注:</span>
            <span class="note-text">${recording.note}</span>
        </div>
        ` : ''}
        <div class="history-item-info">
            <div class="info-row">
                <span class="info-label">警告次数:</span>
                <span class="info-value">${recording.warningCount || 0}</span>
            </div>
            <div class="info-row">
                <span class="info-label">阈值:</span>
                <span class="info-value">${recording.threshold || 80} dB</span>
            </div>
        </div>
        <div class="history-item-files">
            ${recording.audioBlob ? `
                <div class="file-item">
                    <span class="file-icon">🎵</span>
                    <span class="file-name">音频文件</span>
                    <span class="file-size">${formatFileSize(recording.audioSize)}</span>
                    <button class="btn-download-item" data-id="${recording.id}" data-type="audio">下载</button>
                </div>
            ` : ''}
            ${recording.videoBlob ? `
                <div class="file-item">
                    <span class="file-icon">🎬</span>
                    <span class="file-name">视频文件</span>
                    <span class="file-size">${formatFileSize(recording.videoSize)}</span>
                    <button class="btn-download-item" data-id="${recording.id}" data-type="video">下载</button>
                </div>
            ` : ''}
        </div>
    `;
    
    // 绑定删除按钮事件
    const deleteBtn = item.querySelector('.btn-delete');
    deleteBtn.addEventListener('click', () => deleteRecording(recording.id));
    
    // 绑定下载按钮事件
    const downloadBtns = item.querySelectorAll('.btn-download-item');
    downloadBtns.forEach(btn => {
        btn.addEventListener('click', () => downloadRecording(recording.id, btn.dataset.type));
    });
    
    return item;
}

// 下载历史记录文件
async function downloadRecording(id, type) {
    if (!db) {
        await initDB();
    }
    
    const transaction = db.transaction(['recordings'], 'readonly');
    const objectStore = transaction.objectStore('recordings');
    const request = objectStore.get(id);
    
    request.onsuccess = () => {
        const recording = request.result;
        if (!recording) {
            showAlert('文件不存在', 'warning');
            return;
        }
        
        let blob, filename;
        const timestamp = new Date(recording.timestamp).toISOString().replace(/[:.]/g, '-');
        
        if (type === 'audio' && recording.audioBlob) {
            blob = recording.audioBlob;
            filename = `noise-audio-${timestamp}.webm`;
        } else if (type === 'video' && recording.videoBlob) {
            blob = recording.videoBlob;
            filename = `noise-video-${timestamp}.webm`;
        } else {
            showAlert('文件不存在', 'warning');
            return;
        }
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showAlert(`✅ ${type === 'audio' ? '音频' : '视频'}文件下载成功`, 'success');
    };
    
    request.onerror = () => {
        showAlert('下载失败', 'danger');
    };
}

// 删除历史记录
async function deleteRecording(id) {
    if (!confirm('确定要删除这条记录吗？')) {
        return;
    }
    
    if (!db) {
        await initDB();
    }
    
    const transaction = db.transaction(['recordings'], 'readwrite');
    const objectStore = transaction.objectStore('recordings');
    const request = objectStore.delete(id);
    
    request.onsuccess = () => {
        showAlert('记录已删除', 'success');
        loadHistory();
    };
    
    request.onerror = () => {
        showAlert('删除失败', 'danger');
    };
}

// 清空所有历史记录
async function clearAllHistory() {
    if (!confirm('确定要清空所有历史记录吗？此操作不可恢复！')) {
        return;
    }
    
    if (!db) {
        await initDB();
    }
    
    const transaction = db.transaction(['recordings'], 'readwrite');
    const objectStore = transaction.objectStore('recordings');
    const request = objectStore.clear();
    
    request.onsuccess = () => {
        showAlert('所有记录已清空', 'success');
        loadHistory();
    };
    
    request.onerror = () => {
        showAlert('清空失败', 'danger');
    };
}

// 导出历史记录为CSV
async function exportHistoryCsv() {
    if (!db) {
        await initDB();
    }

    const transaction = db.transaction(['recordings'], 'readonly');
    const objectStore = transaction.objectStore('recordings');
    const index = objectStore.index('timestamp');
    const request = index.openCursor(null, 'prev');

    const rows = [['时间', '警告次数', '阈值(dB)', '音频大小', '视频大小', '备注']];

    request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
            const csvContent = rows.map(r => r.map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `noise-history-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showAlert('历史记录已导出', 'success');
            return;
        }
        const r = cursor.value;
        rows.push([
            r.date || '',
            r.warningCount || 0,
            r.threshold || '',
            r.audioSize || 0,
            r.videoSize || 0,
            r.note || ''
        ]);
        cursor.continue();
    };

    request.onerror = () => {
        showAlert('导出失败', 'danger');
    };
}

// 开始监控
async function startMonitoring() {
    try {
        // 请求麦克风权限
        audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            } 
        });

        // 创建音频上下文
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(audioStream);
        
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        microphone.connect(analyser);
        
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        isMonitoring = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        monitorStatus.textContent = '监控中';
        monitorStatus.className = 'monitor-status active';

        // 开始分析
        analyzeAudio();
        drawWaveform();
    } catch (error) {
        console.error('无法访问麦克风:', error);
        alert('无法访问麦克风，请检查权限设置');
    }
}

// 停止监控
function stopMonitoring() {
    isMonitoring = false;
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    startBtn.disabled = false;
    stopBtn.disabled = true;
    monitorStatus.textContent = '已停止';
    monitorStatus.className = 'monitor-status';
    decibelDisplay.textContent = '--';
    levelFill.style.width = '0%';
    
    // 清除波形
    canvasCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
}

// 分析音频并计算分贝
function analyzeAudio() {
    if (!isMonitoring) return;

    analyser.getByteFrequencyData(dataArray);
    
    // 计算平均音量
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    
    // 转换为分贝值 (0-255 映射到 0-100 dB，实际需要校准)
    // 这里使用一个简化的转换公式
    const decibel = Math.round(average * 0.392); // 约等于 100/255
    
    // 更新显示
    decibelDisplay.textContent = decibel;
    
    // 更新进度条
    const percentage = Math.min((decibel / 100) * 100, 100);
    levelFill.style.width = percentage + '%';
    
    // 根据分贝值改变颜色
    if (decibel >= threshold) {
        levelFill.className = 'level-fill danger';
        // 只在未录制时检查警告
        if (!isRecording) {
            checkWarning(decibel);
        }
    } else if (decibel >= threshold - 10) {
        levelFill.className = 'level-fill warning';
    } else {
        levelFill.className = 'level-fill normal';
    }

    // AI噪音类型识别（每500ms更新一次）
    if (noiseClassifier && (!noiseTypeUpdateInterval || Date.now() - noiseTypeUpdateInterval > 500)) {
        try {
            // 获取时域数据用于分类
            const timeData = new Uint8Array(analyser.fftSize);
            analyser.getByteTimeDomainData(timeData);
            
            // 转换为-1到1的范围
            const normalizedData = Array.from(timeData).map(x => (x - 128) / 128);
            
            // 更新噪音类型
            updateNoiseType(normalizedData, audioContext.sampleRate);
            noiseTypeUpdateInterval = Date.now();
        } catch (error) {
            // 静默处理错误，不影响主流程
        }
    }

    // 录制期间，分贝恢复后延迟自动停止
    if (isRecording) {
        if (decibel < threshold - releaseMargin) {
            if (!stopRecordingTimer) {
                stopRecordingTimer = setTimeout(() => {
                    if (isRecording) {
                        stopRecording();
                    }
                }, recordingStopDelay);
            }
        } else {
            if (stopRecordingTimer) {
                clearTimeout(stopRecordingTimer);
                stopRecordingTimer = null;
            }
        }
    }

    animationFrameId = requestAnimationFrame(analyzeAudio);
}

// 绘制波形
function drawWaveform() {
    if (!isMonitoring) return;

    analyser.getByteTimeDomainData(dataArray);
    
    canvasCtx.fillStyle = '#1a1a2e';
    canvasCtx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = '#00d4ff';
    canvasCtx.beginPath();
    
    const sliceWidth = waveformCanvas.width / dataArray.length;
    let x = 0;
    
    for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * waveformCanvas.height / 2;
        
        if (i === 0) {
            canvasCtx.moveTo(x, y);
        } else {
            canvasCtx.lineTo(x, y);
        }
        
        x += sliceWidth;
    }
    
    canvasCtx.lineTo(waveformCanvas.width, waveformCanvas.height / 2);
    canvasCtx.stroke();
    
    requestAnimationFrame(drawWaveform);
}

// 检查警告
function checkWarning(decibel) {
    // 如果正在录制，不再触发警告
    if (isRecording) {
        return;
    }
    
    if (decibel >= threshold) {
        const now = Date.now();
        // 检查是否在冷却时间内
        if (now - lastWarningTime < warningCooldown) {
            return;
        }
        
        lastWarningTime = now;
        warningCount++;
        warningCountEl.textContent = warningCount;
        
        // 显示警告提示
        showAlert(`⚠️ 噪音超标！当前分贝: ${decibel}dB (阈值: ${threshold}dB)`, 'warning');
        sendNoiseNotification('噪音超标警告', `当前分贝 ${decibel}dB，阈值 ${threshold}dB`);
        
        // 如果达到最大警告次数，开始录音录像
        if (warningCount >= maxWarnings) {
            showAlert('🚨 警告次数已达上限，开始录音录像！', 'danger');
            sendNoiseNotification('开始录音录像', '警告次数已达上限，自动开始录制');
            startRecording();
        }
    }
}

// 显示警告提示
function showAlert(message, type = 'info') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alertContainer.appendChild(alert);
    
    // 3秒后自动移除
    setTimeout(() => {
        alert.remove();
    }, 3000);
}

// 浏览器通知
function requestNotificationPermission() {
    if (!('Notification' in window)) {
        showAlert('当前浏览器不支持通知', 'warning');
        return;
    }
    Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
            showAlert('通知已开启', 'success');
            notifyBtn.textContent = '通知已开启';
            notifyBtn.disabled = true;
        } else {
            showAlert('通知未授权', 'warning');
        }
    });
}

function sendNoiseNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        new Notification(title, { body });
    }
}

// 重置警告
function resetWarnings() {
    warningCount = 0;
    warningCountEl.textContent = warningCount;
    showAlert('警告次数已重置', 'info');
}

// 开始录音录像
async function startRecording() {
    // 防止重复启动录制
    if (isRecording) {
        return;
    }
    
    // 清理可能存在的自动停止定时器
    if (stopRecordingTimer) {
        clearTimeout(stopRecordingTimer);
        stopRecordingTimer = null;
    }

    isRecording = true;
    
    try {
        // 获取摄像头权限
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });

        // 合并音频和视频流
        if (audioStream && videoStream) {
            const audioTrack = audioStream.getAudioTracks()[0];
            const videoTrack = videoStream.getVideoTracks()[0];
            combinedStream = new MediaStream([audioTrack, videoTrack]);
        } else if (videoStream) {
            combinedStream = videoStream;
        }

        // 显示视频预览
        videoPreview.srcObject = videoStream;
        recordingPanel.style.display = 'block';

        // 录制视频（包含音频）
        videoChunks = [];
        const videoRecorder = new MediaRecorder(combinedStream, {
            mimeType: 'video/webm;codecs=vp8,opus'
        });

        videoRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                videoChunks.push(event.data);
            }
        };

        videoRecorder.onstop = async () => {
            const videoBlob = new Blob(videoChunks, { type: 'video/webm' });
            const videoUrl = URL.createObjectURL(videoBlob);
            downloadVideo.href = videoUrl;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            downloadVideo.download = `noise-recording-${timestamp}.webm`;
            
            let audioBlob = null;
            // 如果单独录制了音频，也保存
            if (audioChunks.length > 0) {
                audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const audioUrl = URL.createObjectURL(audioBlob);
                downloadAudio.href = audioUrl;
                downloadAudio.download = `noise-audio-${timestamp}.webm`;
            }
            
            // 保存到IndexedDB
            try {
                await saveRecording(audioBlob, videoBlob, {
                    threshold: threshold,
                    warningCount: warningCount
                });
                showAlert('✅ 文件已保存到历史记录', 'success');
            } catch (error) {
                console.error('保存到数据库失败:', error);
                showAlert('保存到数据库失败，但文件仍可下载', 'warning');
            }
            
            downloadPanel.style.display = 'block';
        };

        // 单独录制音频（备用）
        if (audioStream) {
            audioChunks = [];
            const audioRecorder = new MediaRecorder(audioStream, {
                mimeType: 'audio/webm'
            });

            audioRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            audioRecorder.start();
            mediaRecorder = audioRecorder;
        }

        videoRecorder.start();
        mediaRecorder = videoRecorder;

        // 只显示一次提示
        if (!document.querySelector('.recording-panel[style*="display: block"]')) {
            showAlert('✅ 已开始录制音频和视频', 'success');
        }
    } catch (error) {
        console.error('无法访问摄像头:', error);
        showAlert('无法访问摄像头，仅录制音频', 'warning');
        
        // 如果无法访问摄像头，只录制音频
        if (audioStream) {
            audioChunks = [];
            const audioRecorder = new MediaRecorder(audioStream, {
                mimeType: 'audio/webm'
            });

            audioRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            audioRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const audioUrl = URL.createObjectURL(audioBlob);
                downloadAudio.href = audioUrl;
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                downloadAudio.download = `noise-audio-${timestamp}.webm`;
                
                // 保存到IndexedDB
                try {
                    await saveRecording(audioBlob, null, {
                        threshold: threshold,
                        warningCount: warningCount
                    });
                    showAlert('✅ 文件已保存到历史记录', 'success');
                } catch (error) {
                    console.error('保存到数据库失败:', error);
                    showAlert('保存到数据库失败，但文件仍可下载', 'warning');
                }
                
                downloadPanel.style.display = 'block';
            };

            audioRecorder.start();
            mediaRecorder = audioRecorder;
            recordingPanel.style.display = 'block';
            isRecording = true; // 标记正在录制
        }
    }
}

// 停止录制
function stopRecording() {
    if (stopRecordingTimer) {
        clearTimeout(stopRecordingTimer);
        stopRecordingTimer = null;
    }

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    // 停止所有媒体流
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }

    if (videoPreview.srcObject) {
        videoPreview.srcObject = null;
    }

    recordingPanel.style.display = 'none';
    isRecording = false; // 重置录制状态
    if (noteInput) {
        noteInput.value = '';
    }
    showAlert('录制已停止，文件已保存', 'success');
}

// 窗口大小改变时调整Canvas
window.addEventListener('resize', () => {
    waveformCanvas.width = waveformCanvas.offsetWidth;
    drawWaveform();
});

// 页面加载时初始化数据库并加载历史记录
window.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        await initAI(); // 初始化AI模块
        await loadHistory(historySearch.value.trim());
        // 同步设置输入默认值
        if (releaseMarginInput) releaseMarginInput.value = releaseMargin;
        if (stopDelayInput) stopDelayInput.value = recordingStopDelay;
    } catch (error) {
        console.error('初始化失败:', error);
        showAlert('初始化失败: ' + error.message, 'danger');
    }
});

