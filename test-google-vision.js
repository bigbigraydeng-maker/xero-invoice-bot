/**
 * 测试 Google Vision API Key 是否有效
 */
const axios = require('axios');

const API_KEY = process.env.GOOGLE_VISION_API_KEY;

if (!API_KEY) {
    console.error('❌ 错误: 未设置 GOOGLE_VISION_API_KEY 环境变量');
    process.exit(1);
}

console.log('🔍 测试 Google Vision API Key...');
console.log('API Key:', API_KEY.substring(0, 10) + '...');

// 测试请求 - 使用一个简单的图片（1x1 像素的透明 PNG）
const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function testGoogleVision() {
    try {
        const response = await axios.post(
            `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`,
            {
                requests: [{
                    image: { content: testImageBase64 },
                    features: [{ type: 'TEXT_DETECTION' }]
                }]
            },
            { timeout: 10000 }
        );

        console.log('✅ Google Vision API Key 有效！');
        console.log('响应状态:', response.status);
        return true;
    } catch (error) {
        console.error('❌ Google Vision API 测试失败');
        
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
            
            console.error('状态码:', status);
            console.error('错误详情:', JSON.stringify(data, null, 2));
            
            if (status === 400) {
                if (data.error?.message?.includes('API key not valid')) {
                    console.error('\n💡 原因: API Key 无效或已过期');
                    console.error('🔧 解决: 请访问 https://console.cloud.google.com/apis/credentials 生成新的 API Key');
                } else if (data.error?.message?.includes('billing')) {
                    console.error('\n💡 原因: Google Cloud 账户未启用结算或余额不足');
                    console.error('🔧 解决: 请访问 https://console.cloud.google.com/billing 启用结算');
                } else if (data.error?.message?.includes('disabled')) {
                    console.error('\n💡 原因: Vision API 未启用');
                    console.error('🔧 解决: 请访问 https://console.cloud.google.com/apis/library/vision.googleapis.com 启用 API');
                }
            } else if (status === 403) {
                console.error('\n💡 原因: API Key 没有 Vision API 权限');
                console.error('🔧 解决: 检查 API Key 的权限设置');
            }
        } else {
            console.error('网络错误:', error.message);
        }
        
        return false;
    }
}

testGoogleVision();
