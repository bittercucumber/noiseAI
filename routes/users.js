const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');

// 获取用户列表（仅管理员）
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, role } = req.query;
    
    const users = await User.findAll({
      page: parseInt(page),
      limit: parseInt(limit),
      role
    });
    
    // 移除密码字段
    const usersWithoutPasswords = users.map(user => {
      const { password, ...userWithoutPassword } = user;
      userWithoutPassword.settings = JSON.parse(userWithoutPassword.settings || '{}');
      return userWithoutPassword;
    });
    
    const totalUsers = await User.count();
    
    res.json({
      success: true,
      data: usersWithoutPasswords,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalUsers,
        pages: Math.ceil(totalUsers / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({
      error: '获取用户列表失败'
    });
  }
});

// 获取单个用户信息
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查权限：用户只能查看自己的信息，管理员可以查看所有
    if (parseInt(id) !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        error: '无权查看其他用户信息'
      });
    }
    
    const user = await User.findById(id);
    
    if (!user) {
      return res.status(404).json({
        error: '用户不存在'
      });
    }
    
    // 移除密码字段
    const { password, ...userWithoutPassword } = user;
    userWithoutPassword.settings = JSON.parse(userWithoutPassword.settings || '{}');
    
    res.json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({
      error: '获取用户信息失败'
    });
  }
});

// 创建用户（仅管理员）
router.post('/', authenticate, authorize('admin'), [
  body('username').trim().notEmpty().withMessage('用户名不能为空'),
  body('password').isLength({ min: 6 }).withMessage('密码至少6位'),
  body('real_name').trim().notEmpty().withMessage('真实姓名不能为空'),
  body('role').isIn(['teacher', 'grade_admin', 'admin']).withMessage('无效的角色'),
  body('email').optional().isEmail().withMessage('无效的邮箱格式')
], async (req, res) => {
  try {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { username, password, email, real_name, role, settings } = req.body;
    
    // 检查用户名是否已存在
    const existingUser = await User.findByUsername(username);
    if (existingUser) {
      return res.status(400).json({
        error: '用户名已存在'
      });
    }
    
    // 创建用户
    const user = await User.create({
      username,
      password,
      email,
      real_name,
      role,
      settings
    });
    
    // 移除密码字段
    const { password: _, ...userWithoutPassword } = user;
    userWithoutPassword.settings = JSON.parse(userWithoutPassword.settings || '{}');
    
    res.status(201).json({
      success: true,
      message: '用户创建成功',
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('创建用户失败:', error);
    res.status(500).json({
      error: '创建用户失败'
    });
  }
});

// 更新用户信息
router.put('/:id', authenticate, [
  body('email').optional().isEmail().withMessage('无效的邮箱格式'),
  body('real_name').optional().trim().notEmpty().withMessage('真实姓名不能为空'),
  body('role').optional().isIn(['teacher', 'grade_admin', 'admin']).withMessage('无效的角色'),
  body('is_active').optional().isBoolean().withMessage('无效的激活状态')
], async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查权限：用户只能更新自己的信息，管理员可以更新所有
    if (parseInt(id) !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        error: '无权修改其他用户信息'
      });
    }
    
    // 获取原始用户信息
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return res.status(404).json({
        error: '用户不存在'
      });
    }
    
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    // 只有管理员可以修改角色和激活状态
    const updateData = { ...req.body };
    if (req.user.role !== 'admin') {
      delete updateData.role;
      delete updateData.is_active;
    }
    
    // 不能修改密码，密码修改有单独的接口
    delete updateData.password;
    
    // 更新用户
    const user = await User.update(id, updateData);
    
    // 移除密码字段
    const { password, ...userWithoutPassword } = user;
    userWithoutPassword.settings = JSON.parse(userWithoutPassword.settings || '{}');
    
    res.json({
      success: true,
      message: '用户信息更新成功',
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('更新用户信息失败:', error);
    res.status(500).json({
      error: '更新用户信息失败'
    });
  }
});

// 删除用户（仅管理员）
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // 不能删除自己
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({
        error: '不能删除自己的账户'
      });
    }
    
    // 检查用户是否存在
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        error: '用户不存在'
      });
    }
    
    // 删除用户
    await User.delete(id);
    
    res.json({
      success: true,
      message: '用户删除成功'
    });
  } catch (error) {
    console.error('删除用户失败:', error);
    res.status(500).json({
      error: '删除用户失败'
    });
  }
});

// 获取用户统计信息（仅管理员）
router.get('/stats/summary', authenticate, authorize('admin'), async (req, res) => {
  try {
    const stats = await User.getStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取用户统计失败:', error);
    res.status(500).json({
      error: '获取用户统计失败'
    });
  }
});

// 搜索用户
router.get('/search/:keyword', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { keyword } = req.params;
    
    if (!keyword || keyword.length < 2) {
      return res.status(400).json({
        error: '搜索关键词至少2个字符'
      });
    }
    
    const db = require('../config/database').getDatabase();
    const users = await db.query(
      `SELECT id, username, real_name, email, role, created_at, last_login, is_active
       FROM users 
       WHERE username LIKE ? OR real_name LIKE ? OR email LIKE ?
       LIMIT 20`,
      [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
    );
    
    // 移除密码字段（虽然查询中没有包含密码）
    const usersWithoutPasswords = users.map(user => ({
      ...user,
      settings: JSON.parse(user.settings || '{}')
    }));
    
    res.json({
      success: true,
      data: usersWithoutPasswords
    });
  } catch (error) {
    console.error('搜索用户失败:', error);
    res.status(500).json({
      error: '搜索用户失败'
    });
  }
});

// 批量操作用户（激活/禁用）
router.post('/batch', authenticate, authorize('admin'), [
  body('userIds').isArray().withMessage('用户ID列表必须是数组'),
  body('action').isIn(['activate', 'deactivate']).withMessage('无效的操作')
], async (req, res) => {
  try {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { userIds, action } = req.body;
    const is_active = action === 'activate' ? 1 : 0;
    
    // 不能操作自己
    if (userIds.includes(req.user.id)) {
      return res.status(400).json({
        error: '不能操作自己的账户'
      });
    }
    
    const db = require('../config/database').getDatabase();
    
    // 批量更新
    const placeholders = userIds.map(() => '?').join(',');
    const result = await db.run(
      `UPDATE users SET is_active = ? WHERE id IN (${placeholders})`,
      [is_active, ...userIds]
    );
    
    res.json({
      success: true,
      message: `成功${action === 'activate' ? '激活' : '禁用'} ${result.changes} 个用户`,
      changes: result.changes
    });
  } catch (error) {
    console.error('批量操作用户失败:', error);
    res.status(500).json({
      error: '批量操作用户失败'
    });
  }
});

module.exports = router;