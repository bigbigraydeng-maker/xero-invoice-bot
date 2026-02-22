/**
 * 测试新功能：BAS/GST 报告 和 现金流预测
 */

const xero = require('./xero');

async function testNewFeatures() {
    console.log('🧪 测试 Bizmate 新功能\n');
    console.log('=' .repeat(50));
    
    // 测试 1: BAS/GST 报告
    console.log('\n📊 测试 1: BAS/GST 税务报告');
    console.log('-'.repeat(50));
    try {
        const basReport = await xero.getBASReport();
        console.log('✅ BAS/GST 报告获取成功！\n');
        
        console.log('📍 地区:', basReport.region);
        console.log('💰 货币:', basReport.currency);
        console.log('📈 GST 税率:', basReport.gst_rate);
        console.log('');
        
        console.log('📅 报告期间:', basReport.period.from, '至', basReport.period.to);
        console.log('💵 销售总额: $', basReport.sales.total_amount);
        console.log('💵 收取 GST: $', basReport.sales.gst_collected);
        console.log('🧾 销售发票数:', basReport.sales.invoice_count);
        console.log('');
        
        console.log('💳 采购总额: $', basReport.purchases.total_amount);
        console.log('💳 抵扣 GST: $', basReport.purchases.gst_credits);
        console.log('🧾 采购账单数:', basReport.purchases.bill_count);
        console.log('');
        
        console.log('📊 GST 汇总:');
        console.log('   收取 GST: $', basReport.gst_summary.gst_collected);
        console.log('   抵扣 GST: $', basReport.gst_summary.gst_credits);
        console.log('   净 GST:', basReport.gst_summary.is_refund ? '应退' : '应缴', '$', basReport.gst_summary.net_gst_payable);
        console.log('');
        
        console.log('⏰ 截止日期:', basReport.deadline.due_date);
        console.log('⏰ 剩余天数:', basReport.deadline.days_remaining, '天');
        console.log('⚠️ 是否紧急:', basReport.deadline.is_urgent ? '是' : '否');
        console.log('');
        
        console.log('📝 中文解读:');
        console.log('   标题:', basReport.interpretation.title);
        console.log('   摘要:', basReport.interpretation.summary);
        console.log('   说明:', basReport.interpretation.explanation);
        console.log('   建议:');
        basReport.interpretation.advice.forEach((tip, i) => {
            console.log(`      ${i + 1}. ${tip}`);
        });
        
    } catch (error) {
        console.error('❌ BAS/GST 报告测试失败:', error.message);
    }
    
    // 测试 2: 现金流预测
    console.log('\n\n💰 测试 2: 现金流预测（30天）');
    console.log('-'.repeat(50));
    try {
        const cashflow = await xero.getCashflowForecast(30);
        console.log('✅ 现金流预测获取成功！\n');
        
        console.log('📅 预测期间:', cashflow.forecast_period.from, '至', cashflow.forecast_period.to);
        console.log('📊 预测天数:', cashflow.forecast_period.days, '天');
        console.log('');
        
        console.log('💳 当前资金状况:');
        console.log('   银行余额: $', cashflow.current_position.bank_balance);
        console.log('   应收账款: $', cashflow.current_position.total_receivables);
        console.log('   应付账款: $', cashflow.current_position.total_payables);
        console.log('   净头寸: $', cashflow.current_position.net_position);
        console.log('');
        
        console.log('📈 未来30天预测:');
        console.log('   预计流入: $', cashflow.upcoming_summary.expected_inflow);
        console.log('   预计流出: $', cashflow.upcoming_summary.expected_outflow);
        console.log('   净流量:', parseFloat(cashflow.upcoming_summary.net_flow) > 0 ? '净流入' : '净流出', '$', Math.abs(parseFloat(cashflow.upcoming_summary.net_flow)).toFixed(2));
        console.log('');
        
        if (cashflow.risks.length > 0) {
            console.log('⚠️ 风险提示:');
            cashflow.risks.forEach((risk, i) => {
                console.log(`   ${i + 1}. ${risk}`);
            });
            console.log('');
        }
        
        if (cashflow.advice.length > 0) {
            console.log('💡 建议:');
            cashflow.advice.forEach((tip, i) => {
                console.log(`   ${i + 1}. ${tip}`);
            });
            console.log('');
        }
        
        console.log('📝 中文解读:');
        console.log('   摘要:', cashflow.interpretation.summary);
        console.log('   健康状态:', cashflow.interpretation.health_status);
        console.log('   关键洞察:', cashflow.interpretation.key_insight);
        
    } catch (error) {
        console.error('❌ 现金流预测测试失败:', error.message);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('✨ 测试完成！');
}

// 运行测试
testNewFeatures().catch(console.error);
