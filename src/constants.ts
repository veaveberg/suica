export const PRICING = {
    CLOSED: [
        { id: 'c1', name: '8 занятий подряд', price: 280, count: 8 },
        { id: 'c2', name: '4 занятия подряд', price: 150, count: 4 },
        { id: 'c3', name: '4 свободных занятия', price: 170, count: 4 },
    ],
    TECH: [
        { id: 't1', name: 'Разовое', price: 60, count: 1 },
        { id: 't2', name: 'Абонемент на 2 занятия', price: 95, count: 2 },
    ],
    CREATIVE: [
        { id: 'cr1', name: 'Разовое', price: 45, count: 1 },
    ]
};

export const DISCOUNTED_PRICES = {
    TECH_DISCOUNT: 0.9, // 10% off
    CREATIVE_SPECIAL: 30, // 30 GEL for closed group members
};
