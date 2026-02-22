/**
 * BAS/GST 申报周期计算工具
 * 支持澳洲(AU)和新西兰(NZ)的税务周期计算
 */

const logger = require('./logger');

/**
 * 获取上一个完整的月度周期
 * @param {Date} now - 当前日期
 * @returns {Object} {startDate, endDate, periodType, periodName}
 */
function getLastMonthlyPeriod(now = new Date()) {
    // 上个月
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = lastMonth.getFullYear();
    const month = lastMonth.getMonth();
    
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0); // 月末
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        periodType: 'monthly',
        periodName: `${monthNames[month]} ${year}`,
        year: year,
        quarter: Math.floor(month / 3) + 1,
        month: month + 1
    };
}

/**
 * 获取上一个完整的季度周期
 * @param {Date} now - 当前日期
 * @returns {Object} {startDate, endDate, periodType, periodName, quarter}
 */
function getLastQuarterlyPeriod(now = new Date()) {
    const currentQuarter = Math.floor(now.getMonth() / 3); // 0, 1, 2, 3
    
    let targetYear = now.getFullYear();
    let targetQuarter = currentQuarter - 1;
    
    // 如果当前是Q1，上个季度是去年的Q4
    if (targetQuarter < 0) {
        targetQuarter = 3;
        targetYear -= 1;
    }
    
    const quarterStartMonth = targetQuarter * 3; // 0, 3, 6, 9
    const quarterEndMonth = quarterStartMonth + 2;
    
    const startDate = new Date(targetYear, quarterStartMonth, 1);
    const endDate = new Date(targetYear, quarterEndMonth + 1, 0);
    
    const quarterNames = ['Q1 (Jan-Mar)', 'Q2 (Apr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Oct-Dec)'];
    
    return {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        periodType: 'quarterly',
        periodName: `${quarterNames[targetQuarter]} ${targetYear}`,
        year: targetYear,
        quarter: targetQuarter + 1,
        month: null
    };
}

/**
 * 计算 BAS/GST 申报截止日期
 * @param {Object} period - 周期信息
 * @param {string} country - 'AU' 或 'NZ'
 * @param {string} frequency - 'monthly' 或 'quarterly'
 * @returns {Object} {dueDate, daysRemaining, isUrgent}
 */
function calculateDueDate(period, country = 'AU', frequency = 'quarterly') {
    const now = new Date();
    let dueDate;
    
    if (country === 'AU' || country === 'Australia') {
        // 澳洲规则
        if (frequency === 'monthly') {
            // 月度：次月 21 日
            const endDate = new Date(period.endDate);
            dueDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 21);
        } else {
            // 季度：季度后 28 日，Q4 是次年 2 月 28 日
            const quarter = period.quarter;
            const year = period.year;
            
            if (quarter === 4) {
                // Q4 (Oct-Dec) -> 次年 2 月 28 日
                dueDate = new Date(year + 1, 1, 28); // 2月是索引1
            } else {
                // Q1, Q2, Q3 -> 下个月的 28 日
                const endDate = new Date(period.endDate);
                dueDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 28);
            }
        }
    } else if (country === 'NZ' || country === 'New Zealand') {
        // 新西兰规则
        const endDate = new Date(period.endDate);
        if (frequency === 'monthly' || frequency === 'bimonthly') {
            // 月度/双月：次月 28 日
            dueDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 28);
        } else if (frequency === 'sixmonthly') {
            // 六个月：次年 5 月 7 日
            dueDate = new Date(endDate.getFullYear() + 1, 4, 7); // 5月是索引4
        } else {
            // 默认季度：次月 28 日
            dueDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 28);
        }
    } else {
        // 默认使用澳洲规则
        const endDate = new Date(period.endDate);
        dueDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 28);
    }
    
    const daysRemaining = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
    
    return {
        dueDate: formatDate(dueDate),
        daysRemaining: daysRemaining,
        isUrgent: daysRemaining <= 7 && daysRemaining >= 0,
        isOverdue: daysRemaining < 0
    };
}

/**
 * 获取 BAS/GST 报告周期
 * @param {Object} options
 * @param {string} options.frequency - 'monthly' 或 'quarterly'（默认quarterly）
 * @param {string} options.country - 'AU' 或 'NZ'（默认AU）
 * @param {Date} options.now - 当前日期（默认new Date()）
 * @returns {Object} 完整的周期信息
 */
function getBASPeriod(options = {}) {
    const { frequency = 'quarterly', country = 'AU', now = new Date() } = options;
    
    logger.info('Calculating BAS period', { frequency, country });
    
    // 获取周期
    const period = frequency === 'monthly' 
        ? getLastMonthlyPeriod(now)
        : getLastQuarterlyPeriod(now);
    
    // 计算截止日期
    const deadline = calculateDueDate(period, country, frequency);
    
    return {
        ...period,
        country: country,
        frequency: frequency,
        deadline: deadline
    };
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 获取周期描述文本
 */
function getPeriodDescription(period) {
    const { periodType, periodName, frequency, country } = period;
    
    if (country === 'AU' || country === 'Australia') {
        return `${periodName} BAS 周期`;
    } else {
        return `${periodName} GST 周期`;
    }
}

module.exports = {
    getLastMonthlyPeriod,
    getLastQuarterlyPeriod,
    calculateDueDate,
    getBASPeriod,
    getPeriodDescription,
    formatDate
};
