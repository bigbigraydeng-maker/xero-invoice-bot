/**
 * 列出所有 Render 服务
 */

const axios = require('axios');

const RENDER_API_KEY = 'rnd_c6H4rFOyP91xZn1C5WgFxZQUFxzS';

async function listServices() {
    console.log('🔍 列出所有 Render 服务\n');
    
    try {
        const response = await axios.get(
            'https://api.render.com/v1/services?limit=20',
            {
                headers: {
                    'Authorization': `Bearer ${RENDER_API_KEY}`,
                    'Accept': 'application/json'
                }
            }
        );
        
        const services = response.data;
        console.log(`找到 ${services.length} 个服务:\n`);
        
        services.forEach((service, index) => {
            console.log(`${index + 1}. ${service.name}`);
            console.log(`   ID: ${service.id}`);
            console.log(`   类型: ${service.type}`);
            console.log(`   状态: ${service.status}`);
            console.log(`   URL: ${service.url || 'N/A'}`);
            console.log('');
        });
        
    } catch (error) {
        console.error('❌ 获取失败:', error.message);
        if (error.response) {
            console.error('API 错误:', error.response.data);
        }
    }
}

listServices();
