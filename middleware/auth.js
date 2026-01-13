const jwt = require('jsonwebtoken');
const { getDatabase } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'noise-monitor-secret-key-change-in-production';

// 验证JWT token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    const queryToken = typeof req.query?.token === 'string' ? req.query.token : null;
    const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const token = headerToken || queryToken;

    if (!token) {
      return res.status(401).json({
        error: '未提供认证令牌'
      });
    }

    // 验证token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // 获取用户信息
    const db = getDatabase();
    const user = await db.get('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    
    if (!user) {
      return res.status(401).json({
        error: '用户不存在'
      });
    }
    
    if (!user.is_active) {
      return res.status(401).json({
        error: '用户已被禁用'
      });
    }
    
    // 将用户信息附加到请求对象
    req.user = {
      id: user.id,
      username: user.username,
      real_name: user.real_name,
      role: user.role,
      settings: JSON.parse(user.settings || '{}')
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: '令牌已过期'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: '无效的令牌'
      });
    }
    
    return res.status(500).json({
      error: '认证失败'
    });
  }
};

// 检查用户角色权限
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: '需要认证'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: '权限不足'
      });
    }
    
    next();
  };
};

// 生成JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// 验证用户权限（用于教室访问等）
const checkClassroomAccess = async (req, res, next) => {
  try {
    const { classroomId } = req.params;
    const db = getDatabase();
    
    if (!classroomId) {
      return next();
    }
    
    const classroom = await db.get('SELECT * FROM classrooms WHERE id = ?', [classroomId]);
    
    if (!classroom) {
      return res.status(404).json({
        error: '班级不存在'
      });
    }
    
    // 管理员可以访问所有班级
    if (req.user.role === 'admin') {
      return next();
    }
    
    // 年级管理员可以访问自己年级的班级
    if (req.user.role === 'grade_admin') {
      // 这里可以根据年级权限进行判断
      // 假设settings中包含年级信息
      const userSettings = req.user.settings || {};
      if (userSettings.grade && classroom.grade === userSettings.grade) {
        return next();
      }
    }
    
    // 教师只能访问自己管理的班级
    if (req.user.role === 'teacher') {
      if (classroom.teacher_id === req.user.id) {
        return next();
      }
    }
    
    return res.status(403).json({
      error: '无权访问此班级'
    });
  } catch (error) {
    return res.status(500).json({
      error: '权限验证失败'
    });
  }
};

// 记录系统日志
const logAction = async (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // 在响应发送后记录日志
    setTimeout(async () => {
      try {
        const db = getDatabase();
        await db.run(
          `INSERT INTO system_logs (level, message, user_id, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?)`,
          [
            res.statusCode >= 400 ? 'error' : 'info',
            `${req.method} ${req.path} - ${res.statusCode}`,
            req.user?.id || null,
            req.ip,
            req.get('user-agent') || 'unknown'
          ]
        );
      } catch (error) {
        console.error('记录日志失败:', error);
      }
    }, 0);
    
    return originalSend.call(this, data);
  };
  
  next();
};

module.exports = {
  authenticate,
  authorize,
  generateToken,
  checkClassroomAccess,
  logAction,
  JWT_SECRET
};