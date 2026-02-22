/**
 * 项目清理脚本
 * 删除所有临时文件，只保留核心文件
 */

const fs = require('fs');
const path = require('path');

// 要保留的核心文件
const KEEP_FILES = [
    'server.js',
    'xero.js',
    'ocr.js',
    'ocr-unified.js',
    'package.json',
    'package-lock.json',
    '.env',
    '.gitignore',
    'render.yaml',
    'Procfile',
    'requirements.txt',
    'README.md',
    'RENDER_SETUP_GUIDE.md',
    'PROJECT_CLEANUP.md',
    'cleanup-project.js' // 保留自己以便运行
];

// 要保留的目录
const KEEP_DIRS = [
    '.git',
    'data',
    'node_modules',
    'plugins'
];

console.log('🧹 开始清理项目...\n');

const files = fs.readdirSync('.');
let deletedCount = 0;
let keptCount = 0;

files.forEach(file => {
    // 跳过目录
    if (fs.statSync(file).isDirectory()) {
        if (KEEP_DIRS.includes(file)) {
            console.log(`📁 保留目录: ${file}`);
            keptCount++;
        } else {
            console.log(`🗑️  跳过目录: ${file} (请手动处理)`);
        }
        return;
    }

    // 检查是否保留
    if (KEEP_FILES.includes(file)) {
        console.log(`✅ 保留: ${file}`);
        keptCount++;
    } else {
        console.log(`🗑️  删除: ${file}`);
        fs.unlinkSync(file);
        deletedCount++;
    }
});

console.log('\n' + '='.repeat(50));
console.log(`清理完成!`);
console.log(`  保留: ${keptCount} 个文件/目录`);
console.log(`  删除: ${deletedCount} 个文件`);
console.log('='.repeat(50));
