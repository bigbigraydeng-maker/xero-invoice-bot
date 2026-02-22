/**
 * 测试飞书 Webhook 响应
 */

const axios = require('axios');

const SERVICE_URL = 'https://xero-invoice-bot.onrender.com';

async function testFeishuWebhook() {
    console.log('🔍 测试飞书 Webhook 响应\n');
    console.log('=' .repeat(60));
    
    // 1. 测试 URL 验证请求
    console.log('\n1️⃣ 测试 URL 验证请求');
    try {
        const verifyPayload = {
            type: 'url_verification',
            challenge: 'test-challenge-123'
        };
        
        const response = await axios.post(`${SERVICE_URL}/feishu-webhook`, verifyPayload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        
        console.log('✅ 验证请求响应:');
        console.log('  状态码:', response.status);
        console.log('  响应体:', JSON.stringify(response.data, null, 2));
        
        if (response.data && response.data.challenge === 'test-challenge-123') {
            console.log('  ✅ Challenge 验证通过');
        } else {
            console.log('  ❌ Challenge 验证失败');
        }
    } catch (error) {
        console.log('❌ 验证请求失败:', error.message);
        if (error.response) {
            console.log('  状态码:', error.response.status);
            console.log('  响应体:', error.response.data);
        }
    }
    
    // 2. 测试普通 GET 请求
    console.log('\n2️⃣ 测试普通 GET 请求');
    try {
        const response = await axios.get(`${SERVICE_URL}/feishu-webhook`, {
            timeout: 10000
        });
        console.log('✅ GET 响应:');
        console.log('  状态码:', response.status);
        console.log('  响应体:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.log('❌ GET 请求失败:', error.message);
        if (error.response) {
            console.log('  状态码:', error.response.status);
            console.log('  响应体:', error.response.data);
        }
    }
    
    // 3. 测试错误响应
    console.log('\n3️⃣ 测试错误响应');
    try {
        const response = await axios.post(`${SERVICE_URL}/feishu-webhook`, {}, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        console.log('✅ 空请求响应:');
        console.log('  状态码:', response.status);
        console.log('  响应体:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.log('❌ 空请求失败:', error.message);
        if (error.response) {
            console.log('  状态码:', error.response.status);
            console.log('  响应体:', error.response.data);
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 诊断建议:');
    console.log('1. 如果 URL 验证返回 HTML 错误页面，说明路由有问题');
    console.log('2. 如果返回 JSON 但没有 challenge，说明代码逻辑有问题');
    console.log('3. 检查 Render 日志看是否有错误信息');
}

testFeishuWebhook();
