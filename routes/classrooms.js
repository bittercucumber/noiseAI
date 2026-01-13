const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Classroom = require('../models/Classroom');
const User = require('../models/User');
const { authenticate, authorize, checkClassroomAccess } = require('../middleware/auth');

// 获取班级列表
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, grade } = req.query;
    
    // 根据用户角色过滤班级
    let teacher_id;
    if (req.user.role === 'teacher') {
      teacher_id = req.user.id;
    }
    
    const classrooms = await Classroom.findAll({
      page: parseInt(page),
      limit: parseInt(limit),
      grade,
      teacher_id
    });
    
    // 获取总数
    const db = require('../config/database').getDatabase();
    let countQuery = 'SELECT COUNT(*) as total FROM classrooms WHERE 1=1';
    const countParams = [];
    
    if (grade) {
      countQuery += ' AND grade = ?';
      countParams.push(grade);
    }
    
    if (teacher_id) {
      countQuery += ' AND teacher_id = ?';
      countParams.push(teacher_id);
    }
    
    const countResult = await db.get(countQuery, countParams);
    
    res.json({
      success: true,
      data: classrooms,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.total,
        pages: Math.ceil(countResult.total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('获取班级列表失败:', error);
    res.status(500).json({
      error: '获取班级列表失败'
    });
  }
});

// 获取单个班级信息
router.get('/:id', authenticate, checkClassroomAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const classroom = await Classroom.findById(id);
    
    if (!classroom) {
      return res.status(404).json({
        error: '班级不存在'
      });
    }
    
    res.json({
      success: true,
      data: classroom
    });
  } catch (error) {
    console.error('获取班级信息失败:', error);
    res.status(500).json({
      error: '获取班级信息失败'
    });
  }
});

// 创建班级
router.post('/', authenticate, authorize('admin', 'grade_admin'), [
  body('name').trim().notEmpty().withMessage('班级名称不能为空'),
  body('grade').optional().trim(),
  body('student_count').optional().isInt({ min: 0 }).withMessage('学生人数必须是非负整数')
], async (req, res) => {
  try {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const classroomData = req.body;
    
    // 如果指定了教师，检查教师是否存在
    if (classroomData.teacher_id) {
      const teacher = await User.findById(classroomData.teacher_id);
      if (!teacher) {
        return res.status(400).json({
          error: '指定的教师不存在'
        });
      }
    }
    
    // 创建班级
    const classroom = await Classroom.create(classroomData);
    
    res.status(201).json({
      success: true,
      message: '班级创建成功',
      data: classroom
    });
  } catch (error) {
    console.error('创建班级失败:', error);
    res.status(500).json({
      error: '创建班级失败'
    });
  }
});

// 更新班级信息
router.put('/:id', authenticate, checkClassroomAccess, [
  body('name').optional().trim().notEmpty().withMessage('班级名称不能为空')
], async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查班级是否存在
    const existingClassroom = await Classroom.findById(id);
    if (!existingClassroom) {
      return res.status(404).json({
        error: '班级不存在'
      });
    }
    
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const updateData = req.body;
    
    // 如果指定了教师，检查教师是否存在
    if (updateData.teacher_id) {
      const teacher = await User.findById(updateData.teacher_id);
      if (!teacher) {
        return res.status(400).json({
          error: '指定的教师不存在'
        });
      }
    }
    
    // 更新班级
    const classroom = await Classroom.update(id, updateData);
    
    res.json({
      success: true,
      message: '班级更新成功',
      data: classroom
    });
  } catch (error) {
    console.error('更新班级失败:', error);
    res.status(500).json({
      error: '更新班级失败'
    });
  }
});

// 删除班级
router.delete('/:id', authenticate, authorize('admin', 'grade_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查班级是否存在
    const classroom = await Classroom.findById(id);
    if (!classroom) {
      return res.status(404).json({
        error: '班级不存在'
      });
    }
    
    // 删除班级
    await Classroom.delete(id);
    
    res.json({
      success: true,
      message: '班级删除成功'
    });
  } catch (error) {
    console.error('删除班级失败:', error);
    res.status(500).json({
      error: '删除班级失败'
    });
  }
});

// 获取班级统计信息
router.get('/:id/stats', authenticate, checkClassroomAccess, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查班级是否存在
    const classroom = await Classroom.findById(id);
    if (!classroom) {
      return res.status(404).json({
        error: '班级不存在'
      });
    }
    
    // 获取统计信息
    const stats = await Classroom.getStats(id);
    
    res.json({
      success: true,
      data: {
        classroom,
        stats
      }
    });
  } catch (error) {
    console.error('获取班级统计失败:', error);
    res.status(500).json({
      error: '获取班级统计失败'
    });
  }
});

// 获取所有年级
router.get('/grades/all', authenticate, async (req, res) => {
  try {
    const grades = await Classroom.getAllGrades();
    
    res.json({
      success: true,
      data: grades
    });
  } catch (error) {
    console.error('获取年级列表失败:', error);
    res.status(500).json({
      error: '获取年级列表失败'
    });
  }
});

// 获取班级仪表板数据
router.get('/dashboard/stats', authenticate, async (req, res) => {
  try {
    const db = require('../config/database').getDatabase();
    
    // 获取全局统计
    const totalClassrooms = await Classroom.count();
    const totalRecordings = await db.get('SELECT COUNT(*) as count FROM recordings');
    const todayRecordings = await db.get(
      "SELECT COUNT(*) as count FROM recordings WHERE DATE(start_time) = DATE('now')"
    );
    
    // 获取最近活跃班级
    const recentActiveClassrooms = await db.query(`
      SELECT c.id, c.name, c.grade, 
             MAX(r.start_time) as last_recording,
             COUNT(r.id) as recording_count
      FROM classrooms c
      LEFT JOIN recordings r ON c.id = r.classroom_id
      GROUP BY c.id
      ORDER BY last_recording DESC
      LIMIT 10
    `);
    
    // 获取班级排名（按警告次数）
    const classroomRanking = await db.query(`
      SELECT c.id, c.name, c.grade,
             COUNT(r.id) as recordings,
             SUM(r.warning_count) as total_warnings,
             AVG(r.warning_count) as avg_warnings
      FROM classrooms c
      LEFT JOIN recordings r ON c.id = r.classroom_id
      GROUP BY c.id
      ORDER BY avg_warnings DESC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      data: {
        summary: {
          totalClassrooms,
          totalRecordings: totalRecordings.count,
          todayRecordings: todayRecordings.count
        },
        recentActiveClassrooms,
        classroomRanking
      }
    });
  } catch (error) {
    console.error('获取仪表板数据失败:', error);
    res.status(500).json({
      error: '获取仪表板数据失败'
    });
  }
});

module.exports = router;