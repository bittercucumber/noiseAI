const express = require('express');
const router = express.Router();
const { authenticate, checkClassroomAccess } = require('../middleware/auth');
const { getDatabase } = require('../config/database');
const moment = require('moment');

// 智能阈值推荐
router.get('/threshold-recommendation', authenticate, async (req, res) => {
  try {
    const { classroom_id, days = 30 } = req.query;
    const db = getDatabase();
    
    // 构建查询条件
    let query = `
      SELECT threshold, warning_count, start_time
      FROM recordings
      WHERE warning_count IS NOT NULL AND threshold IS NOT NULL
    `;
    const params = [];
    
    if (classroom_id) {
      query += ' AND classroom_id = ?';
      params.push(classroom_id);
    }
    
    if (days) {
      query += ' AND start_time >= DATE("now", ?)';
      params.push(`-${days} days`);
    }
    
    // 根据用户角色过滤
    if (req.user.role === 'teacher') {
      query += ' AND recorded_by = ?';
      params.push(req.user.id);
    }
    
    const recordings = await db.query(query, params);
    
    if (recordings.length === 0) {
      return res.json({
        success: true,
        data: {
          recommendation: 80, // 默认阈值
          confidence: 0,
          reason: '暂无历史数据，使用默认阈值',
          stats: {}
        }
      });
    }
    
    // 分析阈值与警告次数的关系
    const thresholdStats = {};
    recordings.forEach(rec => {
      const threshold = rec.threshold;
      if (!thresholdStats[threshold]) {
        thresholdStats[threshold] = {
          totalWarnings: 0,
          count: 0,
          hasWarnings: 0
        };
      }
      
      thresholdStats[threshold].totalWarnings += rec.warning_count;
      thresholdStats[threshold].count++;
      if (rec.warning_count > 0) {
        thresholdStats[threshold].hasWarnings++;
      }
    });
    
    // 计算每个阈值的平均警告次数和警告率
    const thresholdAnalysis = [];
    for (const [threshold, stats] of Object.entries(thresholdStats)) {
      const avgWarnings = stats.totalWarnings / stats.count;
      const warningRate = stats.hasWarnings / stats.count;
      
      thresholdAnalysis.push({
        threshold: parseInt(threshold),
        avgWarnings,
        warningRate,
        count: stats.count
      });
    }
    
    // 找到最佳阈值（警告次数在1-2次之间，警告率在30-60%之间为最佳）
    let bestThreshold = 80;
    let bestScore = Infinity;
    let bestAnalysis = null;
    
    for (const analysis of thresholdAnalysis) {
      const targetWarnings = 1.5;
      const targetRate = 0.45;
      
      const warningScore = Math.abs(analysis.avgWarnings - targetWarnings);
      const rateScore = Math.abs(analysis.warningRate - targetRate);
      const totalScore = warningScore * 0.7 + rateScore * 0.3;
      
      if (totalScore < bestScore) {
        bestScore = totalScore;
        bestThreshold = analysis.threshold;
        bestAnalysis = analysis;
      }
    }
    
    // 计算置信度
    const confidence = Math.min(0.95, 0.3 + (recordings.length / 100) * 0.7);
    
    // 生成推荐原因
    let reason = '';
    if (recordings.length < 10) {
      reason = '数据量较少，建议收集更多数据';
    } else if (bestAnalysis) {
      if (bestAnalysis.avgWarnings < 0.5) {
        reason = `当前阈值${bestThreshold}dB警告次数偏少(${bestAnalysis.avgWarnings.toFixed(1)}次)，可能过于宽松`;
      } else if (bestAnalysis.avgWarnings > 3) {
        reason = `当前阈值${bestThreshold}dB警告次数偏多(${bestAnalysis.avgWarnings.toFixed(1)}次)，可能过于敏感`;
      } else {
        reason = `推荐阈值${bestThreshold}dB，平均警告${bestAnalysis.avgWarnings.toFixed(1)}次，警告率${(bestAnalysis.warningRate * 100).toFixed(0)}%`;
      }
    }
    
    res.json({
      success: true,
      data: {
        recommendation: bestThreshold,
        confidence: parseFloat(confidence.toFixed(2)),
        reason: reason,
        stats: {
          totalRecordings: recordings.length,
          thresholdAnalysis: thresholdAnalysis.sort((a, b) => a.threshold - b.threshold),
          currentThreshold: thresholdAnalysis.find(t => t.threshold === 80) || null
        }
      }
    });
  } catch (error) {
    console.error('智能阈值推荐失败:', error);
    res.status(500).json({
      error: '智能阈值推荐失败'
    });
  }
});

// 学习效率分析
router.get('/learning-efficiency', authenticate, async (req, res) => {
  try {
    const { classroom_id, days = 30 } = req.query;
    const db = getDatabase();
    
    // 构建查询条件
    let query = `
      SELECT 
        warning_count,
        start_time,
        duration,
        noise_types
      FROM recordings
      WHERE warning_count IS NOT NULL
    `;
    const params = [];
    
    if (classroom_id) {
      query += ' AND classroom_id = ?';
      params.push(classroom_id);
    }
    
    if (days) {
      query += ' AND start_time >= DATE("now", ?)';
      params.push(`-${days} days`);
    }
    
    // 根据用户角色过滤
    if (req.user.role === 'teacher') {
      query += ' AND recorded_by = ?';
      params.push(req.user.id);
    }
    
    query += ' ORDER BY start_time';
    
    const recordings = await db.query(query, params);
    
    if (recordings.length === 0) {
      return res.json({
        success: true,
        data: {
          hasData: false,
          message: '暂无录制记录进行分析'
        }
      });
    }
    
    // 按时间段分析
    const timeSlots = {
      morning: { recordings: [], totalWarnings: 0 },    // 6:00-12:00
      afternoon: { recordings: [], totalWarnings: 0 },  // 12:00-18:00
      evening: { recordings: [], totalWarnings: 0 }     // 18:00-22:00
    };
    
    recordings.forEach(rec => {
      const hour = new Date(rec.start_time).getHours();
      
      if (hour >= 6 && hour < 12) {
        timeSlots.morning.recordings.push(rec);
        timeSlots.morning.totalWarnings += rec.warning_count;
      } else if (hour >= 12 && hour < 18) {
        timeSlots.afternoon.recordings.push(rec);
        timeSlots.afternoon.totalWarnings += rec.warning_count;
      } else if (hour >= 18 && hour < 22) {
        timeSlots.evening.recordings.push(rec);
        timeSlots.evening.totalWarnings += rec.warning_count;
      }
    });
    
    // 计算各时间段统计数据
    const slotAnalysis = {};
    for (const [slot, data] of Object.entries(timeSlots)) {
      const count = data.recordings.length;
      const avgWarnings = count > 0 ? data.totalWarnings / count : 0;
      
      let label = '';
      if (slot === 'morning') label = '上午 (6:00-12:00)';
      else if (slot === 'afternoon') label = '下午 (12:00-18:00)';
      else label = '晚上 (18:00-22:00)';
      
      slotAnalysis[slot] = {
        label,
        recordings: count,
        totalWarnings: data.totalWarnings,
        avgWarnings: parseFloat(avgWarnings.toFixed(2)),
        efficiency: count > 0 ? Math.max(0, 10 - avgWarnings) : 0 // 效率分数
      };
    }
    
    // 分析趋势
    const recentCount = Math.min(10, recordings.length);
    const recentRecordings = recordings.slice(0, recentCount);
    const olderRecordings = recordings.slice(recentCount, recentCount * 2);
    
    const recentAvg = recentRecordings.reduce((sum, rec) => sum + rec.warning_count, 0) / recentRecordings.length;
    const olderAvg = olderRecordings.length > 0 ? 
      olderRecordings.reduce((sum, rec) => sum + rec.warning_count, 0) / olderRecordings.length : 
      recentAvg;
    
    let trend = 'stable';
    let trendValue = 0;
    
    if (olderRecordings.length > 0) {
      trendValue = ((recentAvg - olderAvg) / olderAvg) * 100;
      
      if (trendValue > 10) trend = '上升';
      else if (trendValue < -10) trend = '下降';
      else trend = '稳定';
    }
    
    // 找出最佳学习时段
    const bestSlot = Object.entries(slotAnalysis).reduce((best, current) => {
      if (current[1].recordings === 0) return best;
      if (best[1].recordings === 0) return current;
      return current[1].avgWarnings < best[1].avgWarnings ? current : best;
    });
    
    // 分析噪音类型
    const noiseTypeStats = {};
    recordings.forEach(rec => {
      try {
        if (rec.noise_types) {
          const noiseTypes = JSON.parse(rec.noise_types);
          noiseTypes.forEach(noise => {
            if (noise.type) {
              if (!noiseTypeStats[noise.type]) {
                noiseTypeStats[noise.type] = { count: 0, totalConfidence: 0 };
              }
              noiseTypeStats[noise.type].count++;
              noiseTypeStats[noise.type].totalConfidence += noise.confidence || 0;
            }
          });
        }
      } catch (error) {
        // 忽略解析错误
      }
    });
    
    // 生成建议
    const recommendations = [];
    
    if (slotAnalysis.morning.avgWarnings > 2) {
      recommendations.push('上午时段噪音较多，建议加强早自习纪律管理');
    }
    if (slotAnalysis.afternoon.avgWarnings > 2) {
      recommendations.push('下午时段噪音较多，可能是学生疲劳导致，建议适当安排休息');
    }
    if (slotAnalysis.evening.avgWarnings > 2) {
      recommendations.push('晚上时段噪音较多，建议检查学习环境光线和舒适度');
    }
    
    if (trend === '上升') {
      recommendations.push('⚠️ 近期噪音水平呈上升趋势，需要关注班级纪律');
    } else if (trend === '下降') {
      recommendations.push('✅ 近期噪音水平呈下降趋势，班级纪律有所改善');
    }
    
    if (Object.keys(noiseTypeStats).length > 0) {
      const mainNoise = Object.entries(noiseTypeStats).sort((a, b) => b[1].count - a[1].count)[0];
      if (mainNoise) {
        recommendations.push(`主要噪音类型: ${mainNoise[0]} (出现${mainNoise[1].count}次)`);
      }
    }
    
    if (recommendations.length === 0) {
      recommendations.push('整体噪音水平良好，继续保持');
    }
    
    res.json({
      success: true,
      data: {
        hasData: true,
        totalRecordings: recordings.length,
        timeSlotAnalysis: slotAnalysis,
        trend: {
          direction: trend,
          value: parseFloat(trendValue.toFixed(1)),
          recentAvg: parseFloat(recentAvg.toFixed(2)),
          olderAvg: parseFloat(olderAvg.toFixed(2))
        },
        bestTimeSlot: {
          slot: bestSlot[0],
          ...bestSlot[1]
        },
        noiseTypeStats,
        recommendations,
        summary: {
          overallAvgWarnings: parseFloat((recordings.reduce((sum, rec) => sum + rec.warning_count, 0) / recordings.length).toFixed(2)),
          totalDuration: recordings.reduce((sum, rec) => sum + (rec.duration || 0), 0),
          analysisPeriod: `${days}天`
        }
      }
    });
  } catch (error) {
    console.error('学习效率分析失败:', error);
    res.status(500).json({
      error: '学习效率分析失败'
    });
  }
});

// 班级纪律报告
router.get('/discipline-report', authenticate, async (req, res) => {
  try {
    const { classroom_id, start_date, end_date, format } = req.query;
    const db = getDatabase();
    
    // 如果没有指定班级，分析所有班级
    let query = `
      SELECT 
        r.*,
        c.name as classroom_name,
        c.grade,
        u.real_name as teacher_name
      FROM recordings r
      LEFT JOIN classrooms c ON r.classroom_id = c.id
      LEFT JOIN users u ON c.teacher_id = u.id
      WHERE 1=1
    `;
    const params = [];
    
    if (classroom_id) {
      query += ' AND r.classroom_id = ?';
      params.push(classroom_id);
    }
    
    if (start_date) {
      query += ' AND DATE(r.start_time) >= ?';
      params.push(start_date);
    }
    
    if (end_date) {
      query += ' AND DATE(r.start_time) <= ?';
      params.push(end_date);
    }
    
    // 根据用户角色过滤
    if (req.user.role === 'teacher') {
      query += ' AND (r.recorded_by = ? OR c.teacher_id = ?)';
      params.push(req.user.id, req.user.id);
    }
    
    query += ' ORDER BY r.start_time DESC';
    
    const recordings = await db.query(query, params);
    
    if (recordings.length === 0) {
      const noDataResponse = {
        success: true,
        data: {
          hasData: false,
          message: '指定时间段内无录制记录'
        }
      };

      if (format === 'html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(renderDisciplineReportHtml(noDataResponse.data));
      }

      return res.json(noDataResponse);
    }
    
    // 按班级分组分析
    const classroomData = {};
    recordings.forEach(rec => {
      const classroomId = rec.classroom_id || '未分配班级';
      const className = rec.classroom_name || '未分配班级';
      const grade = rec.grade || '未指定年级';
      const teacher = rec.teacher_name || '未指定教师';
      
      if (!classroomData[classroomId]) {
        classroomData[classroomId] = {
          name: className,
          grade,
          teacher,
          recordings: [],
          totalWarnings: 0,
          totalDuration: 0
        };
      }
      
      classroomData[classroomId].recordings.push(rec);
      classroomData[classroomId].totalWarnings += rec.warning_count;
      classroomData[classroomId].totalDuration += rec.duration || 0;
    });
    
    // 计算每个班级的统计数据
    const classroomReports = [];
    for (const [classroomId, data] of Object.entries(classroomData)) {
      const recordingsCount = data.recordings.length;
      const avgWarnings = data.totalWarnings / recordingsCount;
      const avgDuration = data.totalDuration / recordingsCount;
      
      // 评估纪律水平
      let disciplineLevel = '优秀';
      let levelColor = '#27ae60';
      
      if (avgWarnings >= 3) {
        disciplineLevel = '需改进';
        levelColor = '#e74c3c';
      } else if (avgWarnings >= 2) {
        disciplineLevel = '一般';
        levelColor = '#f39c12';
      } else if (avgWarnings >= 1) {
        disciplineLevel = '良好';
        levelColor = '#3498db';
      }
      
      // 分析噪音类型分布
      const noiseDistribution = {};
      data.recordings.forEach(rec => {
        try {
          if (rec.noise_types) {
            const noiseTypes = JSON.parse(rec.noise_types);
            noiseTypes.forEach(noise => {
              if (noise.type) {
                noiseDistribution[noise.type] = (noiseDistribution[noise.type] || 0) + 1;
              }
            });
          }
        } catch (error) {
          // 忽略解析错误
        }
      });
      
      // 找出主要噪音问题
      const mainNoiseIssues = Object.entries(noiseDistribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type, count]) => ({ type, count }));
      
      classroomReports.push({
        classroomId,
        name: data.name,
        grade: data.grade,
        teacher: data.teacher,
        stats: {
          recordings: recordingsCount,
          totalWarnings: data.totalWarnings,
          avgWarnings: parseFloat(avgWarnings.toFixed(2)),
          totalDuration: data.totalDuration,
          avgDuration: parseFloat(avgDuration.toFixed(1)),
          maxWarnings: Math.max(...data.recordings.map(r => r.warning_count)),
          minWarnings: Math.min(...data.recordings.map(r => r.warning_count))
        },
        discipline: {
          level: disciplineLevel,
          color: levelColor,
          score: Math.max(0, 100 - avgWarnings * 20) // 百分制评分
        },
        noiseIssues: mainNoiseIssues,
        recentRecordings: data.recordings.slice(0, 5).map(rec => ({
          id: rec.id,
          time: rec.start_time,
          warnings: rec.warning_count,
          duration: rec.duration
        }))
      });
    }
    
    // 按纪律评分排序
    classroomReports.sort((a, b) => b.discipline.score - a.discipline.score);
    
    // 整体统计
    const totalRecordings = recordings.length;
    const totalWarnings = recordings.reduce((sum, rec) => sum + rec.warning_count, 0);
    const overallAvgWarnings = totalWarnings / totalRecordings;
    const totalDuration = recordings.reduce((sum, rec) => sum + (rec.duration || 0), 0);
    
    // 整体纪律评估
    let overallLevel = '优秀';
    if (overallAvgWarnings >= 3) overallLevel = '需改进';
    else if (overallAvgWarnings >= 2) overallLevel = '一般';
    else if (overallAvgWarnings >= 1) overallLevel = '良好';
    
    // 生成整体建议
    const overallRecommendations = [];
    
    if (overallAvgWarnings > 2) {
      overallRecommendations.push('整体纪律需要加强，建议开展纪律教育活动');
    }
    
    if (classroomReports.length > 1) {
      const bestClass = classroomReports[0];
      const worstClass = classroomReports[classroomReports.length - 1];
      
      if (bestClass.discipline.score - worstClass.discipline.score > 30) {
        overallRecommendations.push(`班级间纪律差异较大，建议学习${bestClass.name}的管理经验`);
      }
    }
    
    const responseData = {
      hasData: true,
      reportInfo: {
        generatedAt: new Date().toISOString(),
        period: {
          start: start_date || '全部',
          end: end_date || '至今'
        },
        totalClassrooms: classroomReports.length
      },
      summary: {
        totalRecordings,
        totalWarnings,
        overallAvgWarnings: parseFloat(overallAvgWarnings.toFixed(2)),
        totalDuration,
        overallLevel,
        recommendations: overallRecommendations
      },
      classrooms: classroomReports,
      rankings: {
        best: classroomReports.slice(0, 3),
        worst: classroomReports.slice(-3).reverse()
      }
    };

    if (format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(renderDisciplineReportHtml(responseData));
    }

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('生成纪律报告失败:', error);
    res.status(500).json({
      error: '生成纪律报告失败'
    });
  }
});

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDisciplineReportHtml(data) {
  const title = '班级纪律报告';
  const periodText = data?.reportInfo?.period ? `${data.reportInfo.period.start} ~ ${data.reportInfo.period.end}` : '';
  const generatedAt = data?.reportInfo?.generatedAt ? data.reportInfo.generatedAt : new Date().toISOString();

  if (!data || data.hasData === false) {
    const message = data?.message || '暂无数据';
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,'Microsoft YaHei','PingFang SC',sans-serif;background:#f6f7fb;color:#111;margin:0;padding:24px;}
    .card{max-width:980px;margin:0 auto;background:#fff;border:1px solid #e6e8ef;border-radius:12px;padding:20px;}
    .muted{color:#6b7280;font-size:13px;}
    h1{margin:0 0 8px 0;font-size:20px;}
    h2{margin:0 0 10px 0;font-size:16px;}
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <div class="muted">生成时间：${escapeHtml(generatedAt)}</div>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
  }

  const summary = data.summary || {};
  const classrooms = Array.isArray(data.classrooms) ? data.classrooms : [];
  const recommendations = Array.isArray(summary.recommendations) ? summary.recommendations : [];

  const summaryHtml = `
    <div class="grid">
      <div class="stat"><div class="k">总录制数</div><div class="v">${escapeHtml(summary.totalRecordings)}</div></div>
      <div class="stat"><div class="k">总警告数</div><div class="v">${escapeHtml(summary.totalWarnings)}</div></div>
      <div class="stat"><div class="k">平均警告</div><div class="v">${escapeHtml(summary.overallAvgWarnings)}</div></div>
      <div class="stat"><div class="k">纪律水平</div><div class="v">${escapeHtml(summary.overallLevel)}</div></div>
    </div>
  `;

  const recHtml = recommendations.length
    ? `<ul>${recommendations.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`
    : `<div class="muted">暂无建议</div>`;

  const rowsHtml = classrooms.map((c, idx) => {
    const stats = c.stats || {};
    const discipline = c.discipline || {};
    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.grade)}</td>
        <td>${escapeHtml(c.teacher)}</td>
        <td>${escapeHtml(stats.recordings)}</td>
        <td>${escapeHtml(stats.avgWarnings)}</td>
        <td><span class="tag" style="background:${escapeHtml(discipline.color || '#eef2ff')}">${escapeHtml(discipline.level)}</span></td>
        <td>${escapeHtml(discipline.score)}</td>
      </tr>
    `;
  }).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,'Microsoft YaHei','PingFang SC',sans-serif;background:#f6f7fb;color:#111;margin:0;padding:24px;}
    .wrap{max-width:1100px;margin:0 auto;}
    .card{background:#fff;border:1px solid #e6e8ef;border-radius:12px;padding:20px;margin-bottom:16px;}
    .muted{color:#6b7280;font-size:13px;}
    h1{margin:0 0 8px 0;font-size:20px;}
    h2{margin:0 0 10px 0;font-size:16px;}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;}
    .stat{border:1px solid #eef0f6;border-radius:10px;padding:12px;}
    .stat .k{font-size:12px;color:#6b7280;margin-bottom:6px;}
    .stat .v{font-size:18px;font-weight:600;}
    table{width:100%;border-collapse:collapse;}
    th,td{border-bottom:1px solid #eef0f6;padding:10px;text-align:left;font-size:13px;vertical-align:top;}
    th{color:#374151;background:#fafbff;}
    .tag{display:inline-block;padding:2px 8px;border-radius:999px;color:#111;font-size:12px;}
    @media (max-width: 900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${title}</h1>
      <div class="muted">统计区间：${escapeHtml(periodText)} | 生成时间：${escapeHtml(generatedAt)}</div>
    </div>

    <div class="card">
      <h2>总体概览</h2>
      ${summaryHtml}
    </div>

    <div class="card">
      <h2>建议</h2>
      ${recHtml}
    </div>

    <div class="card">
      <h2>班级列表</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>班级</th>
            <th>年级</th>
            <th>教师</th>
            <th>录制数</th>
            <th>平均警告</th>
            <th>纪律水平</th>
            <th>评分</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

// 噪音模式分析
router.get('/noise-patterns', authenticate, async (req, res) => {
  try {
    const { classroom_id, days = 7 } = req.query;
    const db = getDatabase();
    
    // 获取噪音记录
    let query = `
      SELECT 
        nr.timestamp,
        nr.decibel,
        nr.noise_type,
        nr.confidence,
        r.start_time,
        r.classroom_id,
        c.name as classroom_name
      FROM noise_records nr
      JOIN recordings r ON nr.recording_id = r.id
      LEFT JOIN classrooms c ON r.classroom_id = c.id
      WHERE nr.decibel IS NOT NULL
    `;
    const params = [];
    
    if (classroom_id) {
      query += ' AND r.classroom_id = ?';
      params.push(classroom_id);
    }
    
    if (days) {
      query += ' AND r.start_time >= DATETIME("now", ?)';
      params.push(`-${days} days`);
    }
    
    // 根据用户角色过滤
    if (req.user.role === 'teacher') {
      query += ' AND (r.recorded_by = ? OR c.teacher_id = ?)';
      params.push(req.user.id, req.user.id);
    }
    
    query += ' ORDER BY r.start_time, nr.timestamp';
    
    const noiseRecords = await db.query(query, params);
    
    if (noiseRecords.length === 0) {
      return res.json({
        success: true,
        data: {
          hasData: false,
          message: '暂无噪音记录数据'
        }
      });
    }
    
    // 按小时分析噪音模式
    const hourlyPatterns = {};
    const dailyPatterns = {};
    const noiseTypePatterns = {};
    
    noiseRecords.forEach(record => {
      const date = new Date(record.start_time);
      const hour = date.getHours();
      const day = date.toISOString().split('T')[0];
      
      // 小时模式
      if (!hourlyPatterns[hour]) {
        hourlyPatterns[hour] = {
          count: 0,
          totalDecibel: 0,
          noiseTypes: {}
        };
      }
      hourlyPatterns[hour].count++;
      hourlyPatterns[hour].totalDecibel += record.decibel;
      
      if (record.noise_type) {
        hourlyPatterns[hour].noiseTypes[record.noise_type] = 
          (hourlyPatterns[hour].noiseTypes[record.noise_type] || 0) + 1;
      }
      
      // 每日模式
      if (!dailyPatterns[day]) {
        dailyPatterns[day] = {
          count: 0,
          totalDecibel: 0,
          peakDecibel: 0
        };
      }
      dailyPatterns[day].count++;
      dailyPatterns[day].totalDecibel += record.decibel;
      if (record.decibel > dailyPatterns[day].peakDecibel) {
        dailyPatterns[day].peakDecibel = record.decibel;
      }
      
      // 噪音类型模式
      if (record.noise_type) {
        if (!noiseTypePatterns[record.noise_type]) {
          noiseTypePatterns[record.noise_type] = {
            count: 0,
            totalDecibel: 0,
            totalConfidence: 0,
            hourlyDistribution: {}
          };
        }
        noiseTypePatterns[record.noise_type].count++;
        noiseTypePatterns[record.noise_type].totalDecibel += record.decibel;
        noiseTypePatterns[record.noise_type].totalConfidence += record.confidence || 0;
        
        // 按小时分布
        if (!noiseTypePatterns[record.noise_type].hourlyDistribution[hour]) {
          noiseTypePatterns[record.noise_type].hourlyDistribution[hour] = 0;
        }
        noiseTypePatterns[record.noise_type].hourlyDistribution[hour]++;
      }
    });
    
    // 处理小时模式数据
    const hourlyAnalysis = [];
    for (let hour = 0; hour < 24; hour++) {
      if (hourlyPatterns[hour]) {
        const data = hourlyPatterns[hour];
        const avgDecibel = data.totalDecibel / data.count;
        
        // 找出主要噪音类型
        const mainNoiseTypes = Object.entries(data.noiseTypes)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([type, count]) => ({ type, count, percentage: (count / data.count * 100).toFixed(1) }));
        
        hourlyAnalysis.push({
          hour,
          label: `${hour}:00-${hour + 1}:00`,
          count: data.count,
          avgDecibel: parseFloat(avgDecibel.toFixed(1)),
          mainNoiseTypes,
          noiseLevel: avgDecibel < 60 ? '安静' : avgDecibel < 80 ? '正常' : '吵闹'
        });
      } else {
        hourlyAnalysis.push({
          hour,
          label: `${hour}:00-${hour + 1}:00`,
          count: 0,
          avgDecibel: 0,
          mainNoiseTypes: [],
          noiseLevel: '无数据'
        });
      }
    }
    
    // 处理每日模式数据
    const dailyAnalysis = Object.entries(dailyPatterns)
      .map(([date, data]) => ({
        date,
        count: data.count,
        avgDecibel: parseFloat((data.totalDecibel / data.count).toFixed(1)),
        peakDecibel: parseFloat(data.peakDecibel.toFixed(1)),
        dayOfWeek: new Date(date).getDay()
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // 处理噪音类型模式数据
    const noiseTypeAnalysis = Object.entries(noiseTypePatterns)
      .map(([type, data]) => {
        const avgDecibel = data.totalDecibel / data.count;
        const avgConfidence = data.totalConfidence / data.count;
        
        // 找出高发时段
        const peakHours = Object.entries(data.hourlyDistribution)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([hour, count]) => ({
            hour: parseInt(hour),
            count,
            percentage: (count / data.count * 100).toFixed(1)
          }));
        
        return {
          type,
          count: data.count,
          percentage: ((data.count / noiseRecords.length) * 100).toFixed(1),
          avgDecibel: parseFloat(avgDecibel.toFixed(1)),
          avgConfidence: parseFloat(avgConfidence.toFixed(2)),
          peakHours,
          description: getNoiseTypeDescription(type)
        };
      })
      .sort((a, b) => b.count - a.count);
    
    // 找出高峰时段
    const peakHours = hourlyAnalysis
      .filter(h => h.count > 0)
      .sort((a, b) => b.avgDecibel - a.avgDecibel)
      .slice(0, 3);
    
    // 找出主要噪音问题
    const mainNoiseProblems = noiseTypeAnalysis.slice(0, 5);
    
    // 生成建议
    const recommendations = [];
    
    if (peakHours.length > 0 && peakHours[0].avgDecibel > 80) {
      recommendations.push(`⚠️ ${peakHours[0].label}为噪音高峰时段，建议加强该时段的管理`);
    }
    
    if (mainNoiseProblems.length > 0 && mainNoiseProblems[0].percentage > 30) {
      recommendations.push(`主要噪音类型为${mainNoiseProblems[0].type}，占比${mainNoiseProblems[0].percentage}%，需要针对性管理`);
    }
    
    // 检测周期性模式
    const hasMorningPeak = hourlyAnalysis.slice(8, 12).some(h => h.avgDecibel > 75);
    const hasAfternoonPeak = hourlyAnalysis.slice(14, 17).some(h => h.avgDecibel > 75);
    
    if (hasMorningPeak && hasAfternoonPeak) {
      recommendations.push('上下午均出现噪音高峰，建议全天加强纪律管理');
    } else if (hasMorningPeak) {
      recommendations.push('上午时段出现噪音高峰，建议加强早自习管理');
    } else if (hasAfternoonPeak) {
      recommendations.push('下午时段出现噪音高峰，建议加强课堂纪律');
    }
    
    res.json({
      success: true,
      data: {
        hasData: true,
        summary: {
          totalRecords: noiseRecords.length,
          analysisPeriod: `${days}天`,
          avgDecibel: parseFloat((noiseRecords.reduce((sum, r) => sum + r.decibel, 0) / noiseRecords.length).toFixed(1)),
          peakDecibel: Math.max(...noiseRecords.map(r => r.decibel))
        },
        hourlyPatterns: hourlyAnalysis,
        dailyPatterns: dailyAnalysis,
        noiseTypePatterns: noiseTypeAnalysis,
        peakHours,
        mainNoiseProblems,
        recommendations,
        insights: {
          quietestHour: hourlyAnalysis.filter(h => h.count > 0).sort((a, b) => a.avgDecibel - b.avgDecibel)[0],
          noisiestHour: peakHours[0],
          mostCommonNoise: mainNoiseProblems[0]
        }
      }
    });
  } catch (error) {
    console.error('噪音模式分析失败:', error);
    res.status(500).json({
      error: '噪音模式分析失败'
    });
  }
});

// 辅助函数：获取噪音类型描述
function getNoiseTypeDescription(type) {
  const descriptions = {
    '说话声': '学生交谈、讨论、回答问题等语音活动',
    '桌椅移动': '移动桌椅、调整座位产生的噪音',
    '脚步声': '教室内行走、跑动的脚步声',
    '手机铃声': '手机来电、消息提示音',
    '键盘声': '使用键盘、打字的声音',
    '书本声': '翻书、放置书本的声音',
    '环境噪音': '空调、风扇、室外传入的背景噪音',
    '其他': '其他未分类的噪音'
  };
  
  return descriptions[type] || '未分类的噪音类型';
}

module.exports = router;