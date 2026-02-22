/**
 * 检查 Render 服务日志
 */

const axios = require('axios');

const RENDER_API_KEY = 'rnd_c6H4rFOyP91xZn1C5WgFxZQUFxzS';
const SERVICE_ID = 'srv-d6c8l3npm1nc73cd12mg';

async function checkRenderLogs() {
    console.log('🔍 获取 Render 服务日志\n');
    console.log('=' .repeat(60));
    
    try {
        const response = await axios.get(
            `https://api.render.com/v1/services/${SERVICE_ID}/logs`,
            {
                headers: {
                    'Authorization': `Bearer ${RENDER_API_KEY}`,
                    'Accept': 'application/json'
                },
                params: {
                    limit: 50
                }
            }
        );
        
        console.log('最近日志:\n');
        const logs = response.data;
        
        if (Array.isArray(logs)) {
            logs.forEach(log => {
                console.log(log.message || log);
            });
        } else {
            console.log(JSON.stringify(logs, null, 2));
        }
        
    } catch (error) {
        console.error('❌ 获取日志失败:', error.message);
        if (error.response) {
            console.error('状态码:', error.response.status);
            console.error('错误:', error.response.data);
        }
    }
    
    console.log('\n' + '='.repeat(60));
}

checkRenderLogs();
