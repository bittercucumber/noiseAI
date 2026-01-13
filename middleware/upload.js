const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 创建上传目录
const createUploadDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// 存储配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    const uploadDir = path.join('uploads', year.toString(), month, day);
    createUploadDir(uploadDir);
    
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    const filename = file.fieldname + '-' + uniqueSuffix + ext;
    
    cb(null, filename);
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'audio/webm',
    'audio/mp3',
    'audio/wav',
    'audio/mpeg',
    'video/webm',
    'video/mp4',
    'video/quicktime'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型'), false);
  }
};

// 文件大小限制：100MB
const maxSize = 100 * 1024 * 1024;

// 创建multer实例
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: maxSize
  }
});

// 处理文件上传错误的中间件
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: '文件过大，最大支持100MB'
      });
    }
    
    return res.status(400).json({
      error: `文件上传错误: ${err.message}`
    });
  }
  
  if (err) {
    return res.status(400).json({
      error: err.message
    });
  }
  
  next();
};

// 生成文件信息
const generateFileInfo = (req) => {
  if (!req.file) return null;
  
  const file = req.file;
  const filePath = path.relative(process.cwd(), file.path);
  
  return {
    filename: file.filename,
    original_filename: file.originalname,
    file_path: filePath,
    file_size: file.size,
    file_type: file.mimetype,
    upload_time: new Date().toISOString()
  };
};

// 清理临时文件
const cleanupTempFiles = (files) => {
  if (!files) return;
  
  if (Array.isArray(files)) {
    files.forEach(file => {
      if (fs.existsSync(file.path)) {
        fs.unlink(file.path, (err) => {
          if (err) console.error('删除临时文件失败:', err);
        });
      }
    });
  } else if (files.path && fs.existsSync(files.path)) {
    fs.unlink(files.path, (err) => {
      if (err) console.error('删除临时文件失败:', err);
    });
  }
};

// 检查磁盘空间
const checkDiskSpace = (req, res, next) => {
  const uploadDir = path.join('uploads');
  createUploadDir(uploadDir);
  
  try {
    const stats = fs.statfsSync(uploadDir);
    const freeSpace = stats.bsize * stats.bavail;
    const minRequiredSpace = 100 * 1024 * 1024; // 100MB
    
    if (freeSpace < minRequiredSpace) {
      return res.status(507).json({
        error: '磁盘空间不足，请清理空间后再上传'
      });
    }
    
    next();
  } catch (error) {
    console.error('检查磁盘空间失败:', error);
    next();
  }
};

module.exports = {
  upload,
  handleUploadError,
  generateFileInfo,
  cleanupTempFiles,
  checkDiskSpace,
  storage
};