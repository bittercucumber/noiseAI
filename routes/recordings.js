const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Recording = require('../models/Recording');
const Classroom = require('../models/Classroom');
const { authenticate, authorize, checkClassroomAccess } = require('../middleware/auth');
const { upload, handleUploadError, generateFileInfo, cleanupTempFiles } = require('../middleware/upload');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

// 获取录制记录列表
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      classroom_id,
      start_date,
      end_date,
      min_warnings,
      max_warnings
    } = req.query;
    
    // 根据用户角色过滤
    let user_id;
    if (req.user.role === 'teacher') {
      user_id = req.user.id;
    }
    
    const recordings = await Recording.findAll({
      page: parseInt(page),
      limit: parseInt(limit),
      classroom_id,
      start_date,
      end_date,
      min_warnings: min_warnings ? parseInt(min_warnings) : undefined,
      max_warnings: max_warnings ? parseInt(max_warnings) : undefined,
      user_id
    });
    
    // 获取总数
    const stats = await Recording.getStats({
      classroom_id,
      start_date,
      end_date
    });
    
    res.json({
      success: true,
      data: recordings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: stats.total_recordings || 0,
        pages: Math.ceil((stats.total_recordings || 0) / parseInt(limit))
      },
      stats: {
        total_recordings: stats.total_recordings,
        total_size: stats.total_size,
        total_duration: stats.total_duration,
        avg_warnings: stats.avg_warnings
      }
    });
  } catch (error) {
    console.error('获取录制记录失败:', error);
    res.status(500).json({
      error: '获取录制记录失败'
    });
  }
});

// 获取单个录制记录详情
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const recording = await Recording.findById(id);
    
    if (!recording) {
      return res.status(404).json({
        error: '录制记录不存在'
      });
    }
    
    // 检查访问权限（如果记录关联了班级）
    if (recording.classroom_id && req.user.role !== 'admin') {
      const classroom = await Classroom.findById(recording.classroom_id);
      if (req.user.role === 'teacher' && classroom.teacher_id !== req.user.id) {
        return res.status(403).json({
          error: '无权访问此记录'
        });
      }
    }
    
    // 获取噪音详细记录
    const noiseRecords = await Recording.getNoiseRecords(id, 500);
    const warnings = await Recording.getWarnings(id);
    
    res.json({
      success: true,
      data: {
        ...recording,
        noise_records: noiseRecords,
        warnings: warnings
      }
    });
  } catch (error) {
    console.error('获取录制详情失败:', error);
    res.status(500).json({
      error: '获取录制详情失败'
    });
  }
});

// 上传录制文件
router.post('/upload', 
  authenticate,
  upload.single('file'),
  handleUploadError,
  [
    body('classroom_id').optional().trim(),
    body('warning_count').optional().isInt({ min: 0 }),
    body('threshold').optional().isInt({ min: 0, max: 150 }),
    body('max_decibel').optional().isFloat({ min: 0, max: 150 }),
    body('avg_decibel').optional().isFloat({ min: 0, max: 150 }),
    body('duration').optional().isInt({ min: 0 }),
    body('note').optional().trim(),
    body('noise_types').optional(),
    body('metadata').optional()
  ],
  async (req, res) => {
    try {
      // 验证输入
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        cleanupTempFiles(req.file);
        return res.status(400).json({ errors: errors.array() });
      }
      
      if (!req.file) {
        return res.status(400).json({
          error: '请上传文件'
        });
      }
      
      // 生成文件信息
      const fileInfo = generateFileInfo(req);
      
      // 解析JSON数据
      let noiseTypes = [];
      let metadata = {};
      
      try {
        if (req.body.noise_types) {
          noiseTypes = JSON.parse(req.body.noise_types);
        }
        if (req.body.metadata) {
          metadata = JSON.parse(req.body.metadata);
        }
      } catch (parseError) {
        cleanupTempFiles(req.file);
        return res.status(400).json({
          error: 'JSON数据格式错误'
        });
      }
      
      // 检查班级是否存在（如果指定了班级）
      if (req.body.classroom_id) {
        const classroom = await Classroom.findById(req.body.classroom_id);
        if (!classroom) {
          cleanupTempFiles(req.file);
          return res.status(400).json({
            error: '指定的班级不存在'
          });
        }
        
        // 检查教师是否有权限访问该班级
        if (req.user.role === 'teacher' && classroom.teacher_id !== req.user.id) {
          cleanupTempFiles(req.file);
          return res.status(403).json({
            error: '无权上传到此班级'
          });
        }
      }
      
      // 创建录制记录
      const recordingData = {
        ...fileInfo,
        classroom_id: req.body.classroom_id || null,
        warning_count: parseInt(req.body.warning_count || 0),
        threshold: parseInt(req.body.threshold || 80),
        max_decibel: parseFloat(req.body.max_decibel || 0),
        avg_decibel: parseFloat(req.body.avg_decibel || 0),
        duration: parseInt(req.body.duration || 0),
        note: req.body.note || '',
        noise_types: noiseTypes,
        recorded_by: req.user.id,
        start_time: req.body.start_time || new Date().toISOString(),
        end_time: req.body.end_time || new Date().toISOString(),
        metadata: metadata
      };
      
      const recording = await Recording.create(recordingData);
      
      // 保存噪音详细记录（如果有）
      if (req.body.noise_records) {
        try {
          const noiseRecords = JSON.parse(req.body.noise_records);
          if (Array.isArray(noiseRecords) && noiseRecords.length > 0) {
            await Recording.addNoiseRecords(recording.id, noiseRecords);
          }
        } catch (error) {
          console.error('保存噪音记录失败:', error);
        }
      }
      
      // 保存警告记录（如果有）
      if (req.body.warnings) {
        try {
          const warnings = JSON.parse(req.body.warnings);
          if (Array.isArray(warnings) && warnings.length > 0) {
            for (const warning of warnings) {
              await Recording.addWarning(recording.id, warning);
            }
          }
        } catch (error) {
          console.error('保存警告记录失败:', error);
        }
      }
      
      res.status(201).json({
        success: true,
        message: '文件上传成功',
        data: recording
      });
    } catch (error) {
      cleanupTempFiles(req.file);
      console.error('上传文件失败:', error);
      res.status(500).json({
        error: '上传文件失败'
      });
    }
  }
);

// 更新录制记录（主要是备注信息）
router.put('/:id', authenticate, [
  body('note').optional().trim(),
  body('classroom_id').optional().trim()
], async (req, res) => {
  try {
    const { id } = req.params;
    
    // 获取原始记录
    const recording = await Recording.findById(id);
    if (!recording) {
      return res.status(404).json({
        error: '录制记录不存在'
      });
    }
    
    // 检查权限
    if (recording.recorded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        error: '无权修改此记录'
      });
    }
    
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    // 如果更新班级，检查新班级是否存在
    if (req.body.classroom_id && req.body.classroom_id !== recording.classroom_id) {
      const classroom = await Classroom.findById(req.body.classroom_id);
      if (!classroom) {
        return res.status(400).json({
          error: '指定的班级不存在'
        });
      }
    }
    
    // 更新记录
    const updatedRecording = await Recording.update(id, req.body);
    
    res.json({
      success: true,
      message: '录制记录更新成功',
      data: updatedRecording
    });
  } catch (error) {
    console.error('更新录制记录失败:', error);
    res.status(500).json({
      error: '更新录制记录失败'
    });
  }
});

// 删除录制记录
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 获取原始记录
    const recording = await Recording.findById(id);
    if (!recording) {
      return res.status(404).json({
        error: '录制记录不存在'
      });
    }
    
    // 检查权限
    if (recording.recorded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        error: '无权删除此记录'
      });
    }
    
    // 删除物理文件
    if (recording.file_path && fs.existsSync(recording.file_path)) {
      fs.unlink(recording.file_path, (err) => {
        if (err) console.error('删除物理文件失败:', err);
      });
    }
    
    // 删除数据库记录
    await Recording.delete(id);
    
    res.json({
      success: true,
      message: '录制记录删除成功'
    });
  } catch (error) {
    console.error('删除录制记录失败:', error);
    res.status(500).json({
      error: '删除录制记录失败'
    });
  }
});

// 下载文件
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 获取录制记录
    const recording = await Recording.findById(id);
    if (!recording) {
      return res.status(404).json({
        error: '录制记录不存在'
      });
    }
    
    // 检查权限
    if (recording.classroom_id && req.user.role !== 'admin') {
      const classroom = await Classroom.findById(recording.classroom_id);
      if (req.user.role === 'teacher' && classroom.teacher_id !== req.user.id) {
        return res.status(403).json({
          error: '无权下载此文件'
        });
      }
    }
    
    // 检查文件是否存在
    if (!recording.file_path || !fs.existsSync(recording.file_path)) {
      return res.status(404).json({
        error: '文件不存在'
      });
    }
    
    // 设置下载头
    res.download(recording.file_path, recording.original_filename || recording.filename, (err) => {
      if (err) {
        console.error('文件下载失败:', err);
        if (!res.headersSent) {
          res.status(500).json({
            error: '文件下载失败'
          });
        }
      }
    });
  } catch (error) {
    console.error('下载文件失败:', error);
    res.status(500).json({
      error: '下载文件失败'
    });
  }
});

// 导出CSV
router.get('/export/csv', authenticate, async (req, res) => {
  try {
    const {
      classroom_id,
      start_date,
      end_date
    } = req.query;
    
    // 根据用户角色过滤
    let user_id;
    if (req.user.role === 'teacher') {
      user_id = req.user.id;
    }
    
    const csvData = await Recording.exportToCSV({
      classroom_id,
      start_date,
      end_date,
      user_id
    });
    
    // 设置CSV下载头
    const filename = `noise-recordings-${moment().format('YYYY-MM-DD')}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Excel 兼容：添加 UTF-8 BOM
    res.send(`\ufeff${csvData}`);
  } catch (error) {
    console.error('导出CSV失败:', error);
    res.status(500).json({
      error: '导出CSV失败'
    });
  }
});

// 获取录制统计
router.get('/stats/summary', authenticate, async (req, res) => {
  try {
    const { classroom_id, days = 30 } = req.query;
    
    // 根据用户角色过滤
    let user_id;
    if (req.user.role === 'teacher') {
      user_id = req.user.id;
    }
    
    const stats = await Recording.getStats({
      classroom_id,
      start_date: moment().subtract(days, 'days').format('YYYY-MM-DD')
    });
    
    const dailyStats = await Recording.getDailyStats(parseInt(days));
    
    res.json({
      success: true,
      data: {
        summary: stats,
        daily: dailyStats
      }
    });
  } catch (error) {
    console.error('获取录制统计失败:', error);
    res.status(500).json({
      error: '获取录制统计失败'
    });
  }
});

// 获取最吵闹的录制记录
router.get('/stats/noisy', authenticate, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const noisyRecordings = await Recording.getTopNoisyRecordings(parseInt(limit));
    
    res.json({
      success: true,
      data: noisyRecordings
    });
  } catch (error) {
    console.error('获取吵闹记录失败:', error);
    res.status(500).json({
      error: '获取吵闹记录失败'
    });
  }
});

// 获取文件统计
router.get('/stats/files', authenticate, authorize('admin'), async (req, res) => {
  try {
    const fileStats = await Recording.getFileSizeStats();
    
    res.json({
      success: true,
      data: fileStats
    });
  } catch (error) {
    console.error('获取文件统计失败:', error);
    res.status(500).json({
      error: '获取文件统计失败'
    });
  }
});

module.exports = router;