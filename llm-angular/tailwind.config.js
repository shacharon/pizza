/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/**/*.{html,ts}'
    ],
    theme: {
        extend: {
            colors: {
                primary: '#ff6b35',
                accent: '#4285f4',
            },
            borderRadius: {
                brand: '12px',
            },
            animation: {
                'fade-in-up': 'fadeInUp 0.4s ease-out',
            },
            keyframes: {
                fadeInUp: {
                    'from': {
                        opacity: '0',
                        transform: 'translateY(20px)',
                    },
                    'to': {
                        opacity: '1',
                        transform: 'translateY(0)',
                    },
                },
            },
        },
    },
    plugins: [],
};
