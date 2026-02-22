/**
 * Google Vision API 测试脚本
 */

require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.GOOGLE_VISION_API_KEY;

if (!API_KEY) {
    console.error('❌ 错误: GOOGLE_VISION_API_KEY 未设置');
    process.exit(1);
}

console.log('🧪 测试 Google Vision API...');
console.log('API Key:', API_KEY.substring(0, 10) + '...');

// 创建一个简单的测试图片（1x1像素的透明PNG）
const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function testGoogleVision() {
    try {
        console.log('\n📤 发送测试请求...');
        
        const response = await axios.post(
            `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`,
            {
                requests: [{
                    image: {
                        content: testImageBase64
                    },
                    features: [
                        {
                            type: 'TEXT_DETECTION',
                            maxResults: 1
                        }
                    ]
                }]
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
        
        console.log('\n✅ API 调用成功！');
        console.log('响应状态:', response.status);
        console.log('响应数据:', JSON.stringify(response.data, null, 2));
        
        return true;
        
    } catch (error) {
        console.error('\n❌ API 调用失败');
        
        if (error.response) {
            console.error('HTTP 状态:', error.response.status);
            console.error('错误详情:', JSON.stringify(error.response.data, null, 2));
            
            // 常见错误处理
            const errorCode = error.response.data?.error?.code;
            const errorMessage = error.response.data?.error?.message;
            
            if (errorCode === 403) {
                console.error('\n⚠️ 可能原因:');
                console.error('  1. Vision API 未启用');
                console.error('  2. API Key 限制设置不正确');
                console.error('  3. 计费账户问题');
            } else if (errorCode === 400) {
                console.error('\n⚠️ 请求格式错误');
            }
        } else if (error.code === 'ECONNABORTED') {
            console.error('⏱️ 请求超时');
        } else {
            console.error('错误:', error.message);
        }
        
        return false;
    }
}

testGoogleVision().then(success => {
    if (success) {
        console.log('\n🎉 Google Vision API 配置成功！');
        process.exit(0);
    } else {
        console.log('\n💡 请检查:');
        console.log('  1. Vision API 是否已启用');
        console.log('  2. API Key 是否正确');
        console.log('  3. 计费账户是否有效');
        process.exit(1);
    }
});
