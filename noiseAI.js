// AI噪音识别和分析模块
// 使用音频特征提取和机器学习进行噪音分类

class NoiseClassifier {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.featureHistory = [];
        this.maxHistorySize = 100;
    }

    // 初始化模型（使用简单的特征分类器）
    async init() {
        try {
            // 由于训练完整模型需要大量数据，这里使用基于音频特征的规则分类
            // 实际项目中可以加载预训练的TensorFlow.js模型
            this.isModelLoaded = true;
            console.log('噪音分类器初始化完成');
            return true;
        } catch (error) {
            console.error('模型初始化失败:', error);
            return false;
        }
    }

    // 提取音频特征
    extractFeatures(audioData, sampleRate = 44100) {
        const features = {
            // 时域特征
            rms: this.calculateRMS(audioData),
            zeroCrossingRate: this.calculateZeroCrossingRate(audioData),
            spectralCentroid: this.calculateSpectralCentroid(audioData, sampleRate),
            spectralRolloff: this.calculateSpectralRolloff(audioData, sampleRate),
            mfcc: this.calculateMFCC(audioData, sampleRate),
            // 频域特征
            spectralFlux: this.calculateSpectralFlux(audioData),
            peakFrequency: this.findPeakFrequency(audioData, sampleRate)
        };
        return features;
    }

    // 计算RMS（均方根）
    calculateRMS(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i] * data[i];
        }
        return Math.sqrt(sum / data.length);
    }

    // 计算过零率
    calculateZeroCrossingRate(data) {
        let crossings = 0;
        for (let i = 1; i < data.length; i++) {
            if ((data[i] >= 0 && data[i - 1] < 0) || (data[i] < 0 && data[i - 1] >= 0)) {
                crossings++;
            }
        }
        return crossings / data.length;
    }

    // 计算频谱质心
    calculateSpectralCentroid(data, sampleRate) {
        const fft = this.fft(data);
        let weightedSum = 0;
        let magnitudeSum = 0;
        
        for (let i = 0; i < Math.min(fft.length / 2, 512); i++) {
            const magnitude = typeof fft[i] === 'number' ? Math.abs(fft[i]) : Math.sqrt(fft[i].real * fft[i].real + fft[i].imag * fft[i].imag);
            const frequency = (i * sampleRate) / fft.length;
            weightedSum += frequency * magnitude;
            magnitudeSum += magnitude;
        }
        
        return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
    }

    // 计算频谱滚降点
    calculateSpectralRolloff(data, sampleRate) {
        const fft = this.fft(data);
        const magnitudes = [];
        let totalEnergy = 0;
        
        for (let i = 0; i < Math.min(fft.length / 2, 512); i++) {
            const magnitude = typeof fft[i] === 'number' ? Math.abs(fft[i]) : Math.sqrt(fft[i].real * fft[i].real + fft[i].imag * fft[i].imag);
            magnitudes.push(magnitude);
            totalEnergy += magnitude;
        }
        
        if (totalEnergy === 0) return sampleRate / 2;
        
        const threshold = totalEnergy * 0.85;
        let cumulativeEnergy = 0;
        
        for (let i = 0; i < magnitudes.length; i++) {
            cumulativeEnergy += magnitudes[i];
            if (cumulativeEnergy >= threshold) {
                return (i * sampleRate) / fft.length;
            }
        }
        
        return sampleRate / 2;
    }

    // 计算MFCC（简化版）
    calculateMFCC(data, sampleRate) {
        // 简化版MFCC，只计算前5个系数
        const fft = this.fft(data);
        const mfcc = [];
        
        // 使用Mel滤波器组（简化）
        for (let i = 0; i < 5; i++) {
            let melEnergy = 0;
            const startFreq = this.hzToMel((i * sampleRate) / (2 * 5));
            const endFreq = this.hzToMel(((i + 1) * sampleRate) / (2 * 5));
            
            for (let j = 0; j < Math.min(fft.length / 2, 512); j++) {
                const freq = (j * sampleRate) / fft.length;
                const melFreq = this.hzToMel(freq);
                if (melFreq >= startFreq && melFreq <= endFreq) {
                    const magnitude = typeof fft[j] === 'number' ? Math.abs(fft[j]) : Math.sqrt(fft[j].real * fft[j].real + fft[j].imag * fft[j].imag);
                    melEnergy += magnitude;
                }
            }
            
            mfcc.push(Math.log(1 + melEnergy));
        }
        
        return mfcc;
    }

    // Hz转Mel
    hzToMel(hz) {
        return 2595 * Math.log10(1 + hz / 700);
    }

    // 计算频谱通量
    calculateSpectralFlux(data) {
        const fft = this.fft(data);
        let flux = 0;
        let prevMagnitude = 0;
        
        for (let i = 0; i < Math.min(fft.length / 2, 512); i++) {
            const magnitude = typeof fft[i] === 'number' ? Math.abs(fft[i]) : Math.sqrt(fft[i].real * fft[i].real + fft[i].imag * fft[i].imag);
            const diff = magnitude - prevMagnitude;
            if (diff > 0) {
                flux += diff;
            }
            prevMagnitude = magnitude;
        }
        
        return flux;
    }

    // 找到峰值频率
    findPeakFrequency(data, sampleRate) {
        const fft = this.fft(data);
        let maxMagnitude = 0;
        let peakIndex = 0;
        
        for (let i = 0; i < Math.min(fft.length / 2, 512); i++) {
            const magnitude = typeof fft[i] === 'number' ? Math.abs(fft[i]) : Math.sqrt(fft[i].real * fft[i].real + fft[i].imag * fft[i].imag);
            if (magnitude > maxMagnitude) {
                maxMagnitude = magnitude;
                peakIndex = i;
            }
        }
        
        return (peakIndex * sampleRate) / fft.length;
    }

    // 简化的FFT实现（使用DFT）
    fft(data) {
        const N = Math.min(data.length, 512); // 限制大小以提高性能
        const result = [];
        
        // 使用DFT（离散傅里叶变换）简化实现
        for (let k = 0; k < N; k++) {
            let real = 0;
            let imag = 0;
            
            for (let n = 0; n < N; n++) {
                const angle = -2 * Math.PI * k * n / N;
                real += data[n] * Math.cos(angle);
                imag += data[n] * Math.sin(angle);
            }
            
            result.push({ real: real, imag: imag });
        }
        
        return result;
    }

    // 基于特征分类噪音类型
    classifyNoise(features) {
        const { rms, zeroCrossingRate, spectralCentroid, peakFrequency, spectralFlux } = features;
        
        // 保存特征历史
        this.featureHistory.push(features);
        if (this.featureHistory.length > this.maxHistorySize) {
            this.featureHistory.shift();
        }

        // 基于规则分类（实际项目中应使用训练好的模型）
        // 说话声：中等RMS，高过零率，频谱质心在200-2000Hz
        if (zeroCrossingRate > 0.1 && spectralCentroid > 200 && spectralCentroid < 2000 && rms > 0.01) {
            return { type: '说话声', confidence: 0.75, icon: '🗣️' };
        }
        
        // 桌椅移动：低RMS，低过零率，低频
        if (rms < 0.05 && zeroCrossingRate < 0.05 && peakFrequency < 500) {
            return { type: '桌椅移动', confidence: 0.70, icon: '🪑' };
        }
        
        // 手机铃声：高RMS，高过零率，高频
        if (rms > 0.1 && zeroCrossingRate > 0.15 && peakFrequency > 2000) {
            return { type: '手机铃声', confidence: 0.80, icon: '📱' };
        }
        
        // 脚步声：中等RMS，中等过零率，低频
        if (rms > 0.03 && rms < 0.08 && zeroCrossingRate > 0.05 && zeroCrossingRate < 0.1 && peakFrequency < 1000) {
            return { type: '脚步声', confidence: 0.65, icon: '👣' };
        }
        
        // 键盘声：低RMS，高过零率，高频
        if (rms < 0.05 && zeroCrossingRate > 0.12 && peakFrequency > 1500) {
            return { type: '键盘声', confidence: 0.60, icon: '⌨️' };
        }
        
        // 默认：环境噪音
        return { type: '环境噪音', confidence: 0.50, icon: '🔊' };
    }

    // 实时分类（从音频数据）
    classifyAudioData(audioData, sampleRate) {
        if (!this.isModelLoaded) return null;
        
        const features = this.extractFeatures(audioData, sampleRate);
        return this.classifyNoise(features);
    }
}

// 智能阈值推荐算法
class SmartThresholdRecommender {
    constructor() {
        this.historyData = [];
    }

    // 加载历史数据
    async loadHistoryData(db) {
        return new Promise((resolve) => {
            if (!db) {
                resolve([]);
                return;
            }
            
            const transaction = db.transaction(['recordings'], 'readonly');
            const objectStore = transaction.objectStore('recordings');
            const index = objectStore.index('timestamp');
            const request = index.openCursor(null, 'prev');
            
            const data = [];
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (!cursor) {
                    this.historyData = data;
                    resolve(data);
                    return;
                }
                
                const recording = cursor.value;
                if (recording.threshold && recording.warningCount !== undefined) {
                    data.push({
                        threshold: recording.threshold,
                        warningCount: recording.warningCount,
                        timestamp: recording.timestamp,
                        classroomId: recording.classroomId
                    });
                }
                
                cursor.continue();
            };
            
            request.onerror = () => {
                resolve([]);
            };
        });
    }

    // 推荐最佳阈值
    recommendThreshold(currentClassroomId = null, currentThreshold = 80) {
        if (this.historyData.length === 0) {
            return {
                recommended: currentThreshold,
                confidence: 0.3,
                reason: '暂无历史数据，使用默认值'
            };
        }

        // 过滤当前班级的数据
        let relevantData = this.historyData;
        if (currentClassroomId) {
            relevantData = this.historyData.filter(d => d.classroomId === currentClassroomId);
        }

        if (relevantData.length === 0) {
            relevantData = this.historyData;
        }

        // 分析阈值与警告次数的关系
        const thresholdStats = {};
        relevantData.forEach(d => {
            const threshold = d.threshold;
            if (!thresholdStats[threshold]) {
                thresholdStats[threshold] = { total: 0, warnings: 0, count: 0 };
            }
            thresholdStats[threshold].total += d.warningCount;
            thresholdStats[threshold].count++;
            thresholdStats[threshold].warnings += d.warningCount > 0 ? 1 : 0;
        });

        // 找到最佳阈值（警告次数适中，既不过于敏感也不过于宽松）
        let bestThreshold = currentThreshold;
        let bestScore = Infinity;

        for (const [threshold, stats] of Object.entries(thresholdStats)) {
            const avgWarnings = stats.total / stats.count;
            const warningRate = stats.warnings / stats.count;
            
            // 评分：警告次数在1-2次之间，警告率在30-60%之间为最佳
            const targetWarnings = 1.5;
            const targetRate = 0.45;
            
            const warningScore = Math.abs(avgWarnings - targetWarnings);
            const rateScore = Math.abs(warningRate - targetRate);
            const totalScore = warningScore * 2 + rateScore;
            
            if (totalScore < bestScore) {
                bestScore = totalScore;
                bestThreshold = parseInt(threshold);
            }
        }

        // 如果推荐值与当前值差异不大，保持当前值
        if (Math.abs(bestThreshold - currentThreshold) < 5) {
            bestThreshold = currentThreshold;
        }

        const confidence = Math.min(0.9, 0.5 + relevantData.length / 100);
        const reason = relevantData.length > 10 
            ? `基于${relevantData.length}条历史数据分析，推荐阈值为${bestThreshold}dB`
            : '数据量较少，建议收集更多数据后重新分析';

        return {
            recommended: bestThreshold,
            confidence: confidence,
            reason: reason,
            stats: thresholdStats
        };
    }
}

// 学习效率分析器
class LearningEfficiencyAnalyzer {
    constructor() {
        this.analysisData = [];
    }

    // 分析噪音水平与学习效率的关系
    async analyzeEfficiency(db, classroomId = null) {
        return new Promise((resolve) => {
            if (!db) {
                resolve(null);
                return;
            }
            
            const transaction = db.transaction(['recordings'], 'readonly');
            const objectStore = transaction.objectStore('recordings');
            const index = objectStore.index('timestamp');
            const request = index.openCursor(null, 'prev');
            
            const data = [];
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (!cursor) {
                    const analysis = this.performAnalysis(data, classroomId);
                    resolve(analysis);
                    return;
                }
                
                const recording = cursor.value;
                if ((!classroomId || recording.classroomId === classroomId) && 
                    recording.threshold && recording.warningCount !== undefined) {
                    data.push({
                        timestamp: recording.timestamp,
                        date: recording.date,
                        threshold: recording.threshold,
                        warningCount: recording.warningCount,
                        classroomId: recording.classroomId,
                        classroomName: recording.classroomName
                    });
                }
                
                cursor.continue();
            };
            
            request.onerror = () => {
                resolve(null);
            };
        });
    }

    // 执行分析
    performAnalysis(data, classroomId) {
        if (data.length === 0) {
            return {
                hasData: false,
                message: '暂无数据进行分析'
            };
        }

        // 按时间段分析
        const timeSlots = {
            morning: [], // 8-12点
            afternoon: [], // 12-18点
            evening: [] // 18-22点
        };

        data.forEach(d => {
            const date = new Date(d.timestamp);
            const hour = date.getHours();
            if (hour >= 8 && hour < 12) {
                timeSlots.morning.push(d);
            } else if (hour >= 12 && hour < 18) {
                timeSlots.afternoon.push(d);
            } else if (hour >= 18 && hour < 22) {
                timeSlots.evening.push(d);
            }
        });

        // 计算各时间段的平均警告次数
        const avgWarnings = {
            morning: this.calculateAvgWarnings(timeSlots.morning),
            afternoon: this.calculateAvgWarnings(timeSlots.afternoon),
            evening: this.calculateAvgWarnings(timeSlots.evening)
        };

        // 分析趋势
        const recentData = data.slice(0, 30); // 最近30条
        const olderData = data.slice(30, 60); // 更早的30条
        
        const recentAvg = this.calculateAvgWarnings(recentData);
        const olderAvg = this.calculateAvgWarnings(olderData);
        const trend = recentAvg > olderAvg ? '上升' : recentAvg < olderAvg ? '下降' : '稳定';

        // 最佳学习时段（警告次数最少的时段）
        const bestSlot = Object.keys(avgWarnings).reduce((a, b) => 
            avgWarnings[a] < avgWarnings[b] ? a : b
        );

        const slotNames = {
            morning: '上午（8-12点）',
            afternoon: '下午（12-18点）',
            evening: '晚上（18-22点）'
        };

        return {
            hasData: true,
            totalRecords: data.length,
            timeSlotAnalysis: {
                morning: {
                    avgWarnings: avgWarnings.morning,
                    records: timeSlots.morning.length,
                    label: slotNames.morning
                },
                afternoon: {
                    avgWarnings: avgWarnings.afternoon,
                    records: timeSlots.afternoon.length,
                    label: slotNames.afternoon
                },
                evening: {
                    avgWarnings: avgWarnings.evening,
                    records: timeSlots.evening.length,
                    label: slotNames.evening
                }
            },
            trend: trend,
            bestTimeSlot: {
                slot: bestSlot,
                label: slotNames[bestSlot],
                avgWarnings: avgWarnings[bestSlot]
            },
            recommendations: this.generateRecommendations(avgWarnings, trend)
        };
    }

    calculateAvgWarnings(data) {
        if (data.length === 0) return 0;
        const sum = data.reduce((acc, d) => acc + (d.warningCount || 0), 0);
        return (sum / data.length).toFixed(2);
    }

    generateRecommendations(avgWarnings, trend) {
        const recommendations = [];
        
        if (avgWarnings.morning > 2) {
            recommendations.push('上午时段噪音较多，建议加强纪律管理');
        }
        if (avgWarnings.afternoon > 2) {
            recommendations.push('下午时段噪音较多，可能是学生疲劳导致，建议适当休息');
        }
        if (avgWarnings.evening > 2) {
            recommendations.push('晚上时段噪音较多，建议检查学习环境');
        }
        
        if (trend === '上升') {
            recommendations.push('⚠️ 噪音水平呈上升趋势，需要关注班级纪律');
        } else if (trend === '下降') {
            recommendations.push('✅ 噪音水平呈下降趋势，班级纪律有所改善');
        }
        
        if (recommendations.length === 0) {
            recommendations.push('整体噪音水平良好，继续保持');
        }
        
        return recommendations;
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NoiseClassifier, SmartThresholdRecommender, LearningEfficiencyAnalyzer };
}

