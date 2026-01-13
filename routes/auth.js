const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken, authenticate } = require('../middleware/auth');

// 用户登录
router.post('/login', [
  body('username').trim().notEmpty().withMessage('用户名不能为空'),
  body('password').notEmpty().withMessage('密码不能为空')
], async (req, res) => {
  try {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { username, password } = req.body;
    
    // 查找用户
    const user = await User.findByUsername(username);
    
    if (!user) {
      return res.status(401).json({
        error: '用户名或密码错误'
      });
    }
    
    if (!user.is_active) {
      return res.status(401).json({
        error: '账户已被禁用'
      });
    }
    
    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        error: '用户名或密码错误'
      });
    }
    
    // 更新最后登录时间
    await User.updateLastLogin(user.id);
    
    // 生成token
    const token = generateToken(user.id);
    
    // 移除密码信息
    const { password: _, ...userWithoutPassword } = user;
    userWithoutPassword.settings = JSON.parse(userWithoutPassword.settings || '{}');
    
    res.json({
      success: true,
      token,
      user: userWithoutPassword,
      expiresIn: 24 * 60 * 60 // 24小时
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({
      error: '登录失败，请稍后重试'
    });
  }
});

// 用户注册（仅限管理员创建用户）
router.post('/register', [
  authenticate,
  body('username').trim().notEmpty().withMessage('用户名不能为空'),
  body('password').isLength({ min: 6 }).withMessage('密码至少6位'),
  body('real_name').trim().notEmpty().withMessage('真实姓名不能为空'),
  body('role').isIn(['teacher', 'grade_admin', 'admin']).withMessage('无效的角色')
], async (req, res) => {
  try {
    // 只有管理员可以创建用户
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: '只有管理员可以创建用户'
      });
    }
    
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
    
    // 移除密码信息
    const { password: _, ...userWithoutPassword } = user;
    userWithoutPassword.settings = JSON.parse(userWithoutPassword.settings || '{}');
    
    res.status(201).json({
      success: true,
      message: '用户创建成功',
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('注册失败:', error);
    res.status(500).json({
      error: '创建用户失败'
    });
  }
});

// 获取当前用户信息
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        error: '用户不存在'
      });
    }
    
    // 移除密码信息
    const { password, ...userWithoutPassword } = user;
    userWithoutPassword.settings = JSON.parse(userWithoutPassword.settings || '{}');
    
    res.json({
      success: true,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({
      error: '获取用户信息失败'
    });
  }
});

// 修改密码
router.put('/change-password', authenticate, [
  body('currentPassword').notEmpty().withMessage('当前密码不能为空'),
  body('newPassword').isLength({ min: 6 }).withMessage('新密码至少6位')
], async (req, res) => {
  try {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    
    // 获取用户信息
    const user = await User.findById(userId);
    
    // 验证当前密码
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    
    if (!isValidPassword) {
      return res.status(400).json({
        error: '当前密码错误'
      });
    }
    
    // 更新密码
    await User.update(userId, { password: newPassword });
    
    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    console.error('修改密码失败:', error);
    res.status(500).json({
      error: '修改密码失败'
    });
  }
});

// 更新用户设置
router.put('/settings', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        error: '无效的设置数据'
      });
    }
    
    await User.update(userId, { settings });
    
    res.json({
      success: true,
      message: '设置更新成功'
    });
  } catch (error) {
    console.error('更新设置失败:', error);
    res.status(500).json({
      error: '更新设置失败'
    });
  }
});

// 退出登录
router.post('/logout', authenticate, (req, res) => {
  // JWT是无状态的，客户端需要自己删除token
  res.json({
    success: true,
    message: '退出成功'
  });
});

// 重置密码（管理员功能）
router.post('/reset-password', authenticate, [
  body('userId').isInt().withMessage('无效的用户ID'),
  body('newPassword').isLength({ min: 6 }).withMessage('密码至少6位')
], async (req, res) => {
  try {
    // 只有管理员可以重置密码
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: '只有管理员可以重置密码'
      });
    }
    
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { userId, newPassword } = req.body;
    
    // 检查用户是否存在
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: '用户不存在'
      });
    }
    
    // 更新密码
    await User.update(userId, { password: newPassword });
    
    res.json({
      success: true,
      message: '密码重置成功'
    });
  } catch (error) {
    console.error('重置密码失败:', error);
    res.status(500).json({
      error: '重置密码失败'
    });
  }
});

module.exports = router;