const { getDatabase } = require('../config/database');

class Classroom {
  static async create(classroomData) {
    const db = getDatabase();
    const id = classroomData.id || `class_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const result = await db.run(
      `INSERT INTO classrooms (id, name, description, grade, teacher_id, student_count, settings) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        classroomData.name,
        classroomData.description || null,
        classroomData.grade || null,
        classroomData.teacher_id || null,
        classroomData.student_count || 0,
        JSON.stringify(classroomData.settings || {})
      ]
    );
    
    return this.findById(id);
  }

  static async findById(id) {
    const db = getDatabase();
    return await db.get('SELECT * FROM classrooms WHERE id = ?', [id]);
  }

  static async findAll(options = {}) {
    const db = getDatabase();
    const { page = 1, limit = 20, grade, teacher_id } = options;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT c.*, u.real_name as teacher_name, u.username as teacher_username
      FROM classrooms c
      LEFT JOIN users u ON c.teacher_id = u.id
      WHERE 1=1
    `;
    const params = [];
    
    if (grade) {
      query += ' AND c.grade = ?';
      params.push(grade);
    }
    
    if (teacher_id) {
      query += ' AND c.teacher_id = ?';
      params.push(teacher_id);
    }
    
    query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return await db.query(query, params);
  }

  static async update(id, classroomData) {
    const db = getDatabase();
    const updates = [];
    const params = [];
    
    if (classroomData.name !== undefined) {
      updates.push('name = ?');
      params.push(classroomData.name);
    }
    
    if (classroomData.description !== undefined) {
      updates.push('description = ?');
      params.push(classroomData.description);
    }
    
    if (classroomData.grade !== undefined) {
      updates.push('grade = ?');
      params.push(classroomData.grade);
    }
    
    if (classroomData.teacher_id !== undefined) {
      updates.push('teacher_id = ?');
      params.push(classroomData.teacher_id);
    }
    
    if (classroomData.student_count !== undefined) {
      updates.push('student_count = ?');
      params.push(classroomData.student_count);
    }
    
    if (classroomData.settings !== undefined) {
      updates.push('settings = ?');
      params.push(JSON.stringify(classroomData.settings));
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    
    params.push(id);
    
    const query = `UPDATE classrooms SET ${updates.join(', ')} WHERE id = ?`;
    await db.run(query, params);
    
    return this.findById(id);
  }

  static async delete(id) {
    const db = getDatabase();
    await db.run('DELETE FROM classrooms WHERE id = ?', [id]);
  }

  static async getStats(classroomId) {
    const db = getDatabase();
    
    // 基础统计
    const basicStats = await db.get(`
      SELECT 
        COUNT(*) as total_recordings,
        AVG(warning_count) as avg_warnings,
        MAX(warning_count) as max_warnings,
        AVG(threshold) as avg_threshold,
        SUM(duration) as total_duration
      FROM recordings
      WHERE classroom_id = ?
    `, [classroomId]);
    
    // 最近录制
    const recentRecordings = await db.query(`
      SELECT id, filename, warning_count, start_time, duration
      FROM recordings
      WHERE classroom_id = ?
      ORDER BY start_time DESC
      LIMIT 10
    `, [classroomId]);
    
    // 噪音类型统计
    const noiseStats = await db.query(`
      SELECT noise_type, COUNT(*) as count, AVG(confidence) as avg_confidence
      FROM noise_records nr
      JOIN recordings r ON nr.recording_id = r.id
      WHERE r.classroom_id = ? AND noise_type IS NOT NULL
      GROUP BY noise_type
      ORDER BY count DESC
    `, [classroomId]);
    
    // 警告趋势（按天）
    const warningTrend = await db.query(`
      SELECT 
        DATE(start_time) as date,
        COUNT(*) as recordings,
        AVG(warning_count) as avg_warnings
      FROM recordings
      WHERE classroom_id = ?
      GROUP BY DATE(start_time)
      ORDER BY date DESC
      LIMIT 30
    `, [classroomId]);
    
    return {
      ...basicStats,
      recentRecordings,
      noiseStats,
      warningTrend,
      totalNoiseRecords: await db.get(
        'SELECT COUNT(*) as count FROM noise_records nr JOIN recordings r ON nr.recording_id = r.id WHERE r.classroom_id = ?',
        [classroomId]
      )
    };
  }

  static async count() {
    const db = getDatabase();
    const result = await db.get('SELECT COUNT(*) as count FROM classrooms');
    return result.count;
  }

  static async getAllGrades() {
    const db = getDatabase();
    return await db.query(
      'SELECT DISTINCT grade FROM classrooms WHERE grade IS NOT NULL ORDER BY grade'
    );
  }

  static async getClassroomMetrics() {
    const db = getDatabase();
    
    const totalClassrooms = await this.count();
    const classroomsByGrade = await db.query(
      'SELECT grade, COUNT(*) as count FROM classrooms GROUP BY grade'
    );
    const avgStudents = await db.get(
      'SELECT AVG(student_count) as avg_students FROM classrooms'
    );
    
    return {
      total: totalClassrooms,
      byGrade: classroomsByGrade,
      avgStudents: Math.round(avgStudents.avg_students || 0)
    };
  }
}

module.exports = Classroom;