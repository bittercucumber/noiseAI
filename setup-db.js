const { initDatabase } = require('./config/database');
const path = require('path');
const fs = require('fs');

async function setupDatabase() {
  console.log('开始初始化数据库...');
  
  try {
    // 初始化数据库
    const db = await initDatabase();
    console.log('✅ 数据库初始化完成');
    
    // 创建示例数据（可选）
    console.log('创建示例数据...');
    
    // 创建示例班级
    await db.run(`
      INSERT OR IGNORE INTO classrooms (id, name, grade, teacher_id, student_count, description)
      VALUES 
      ('class_2023_1', '高一(1)班', '高一', 1, 45, '高一年级重点班'),
      ('class_2023_2', '高一(2)班', '高一', 1, 48, '高一年级普通班'),
      ('class_2023_3', '高二(1)班', '高二', 1, 42, '高二年级理科班')
    `);
    
    console.log('✅ 示例数据创建完成');
    
    // 显示数据库信息
    const userCount = await db.get('SELECT COUNT(*) as count FROM users');
    const classroomCount = await db.get('SELECT COUNT(*) as count FROM classrooms');
    
    console.log('\n📊 数据库信息:');
    console.log(`   用户数: ${userCount.count}`);
    console.log(`   班级数: ${classroomCount.count}`);
    
    console.log('\n🎉 数据库设置完成!');
    console.log('\n🔑 默认管理员账号:');
    console.log('   用户名: admin');
    console.log('   密码: admin123');
    console.log('\n⚠️  请立即修改默认密码！');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    process.exit(1);
  }
}

setupDatabase();