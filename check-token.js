/**
 * 检查 Token 状态
 */

require('dotenv').config();
const fs = require('fs');

// 读取 token
const tokens = JSON.parse(fs.readFileSync('./data/tokens.json', 'utf-8'));

// 解码 access_token (JWT)
const accessTokenParts = tokens.access_token.split('.');
const accessPayload = JSON.parse(Buffer.from(accessTokenParts[1], 'base64').toString());

console.log('🔍 Token 信息检查\n');
console.log('=' .repeat(50));

console.log('\n📋 Access Token 内容:');
console.log('  Client ID:', accessPayload.client_id);
console.log('  过期时间:', new Date(accessPayload.exp * 1000).toLocaleString());
console.log('  是否已过期:', Date.now() > accessPayload.exp * 1000 ? '是 ⚠️' : '否 ✅');

console.log('\n📋 环境变量配置:');
console.log('  XERO_CLIENT_ID:', process.env.XERO_CLIENT_ID);
console.log('  XERO_CLIENT_SECRET:', process.env.XERO_CLIENT_SECRET ? '已设置 ✅' : '未设置 ❌');

console.log('\n📋 对比检查:');
const envClientId = process.env.XERO_CLIENT_ID;
const tokenClientId = accessPayload.client_id;

if (envClientId === tokenClientId) {
    console.log('  ✅ Client ID 匹配');
} else {
    console.log('  ❌ Client ID 不匹配!');
    console.log('     Token中的:', tokenClientId);
    console.log('     环境变量:', envClientId);
}

console.log('\n📋 Refresh Token:');
console.log('  是否存在:', tokens.refresh_token ? '是 ✅' : '否 ❌');
console.log('  长度:', tokens.refresh_token ? tokens.refresh_token.length : 0);

console.log('\n' + '='.repeat(50));
