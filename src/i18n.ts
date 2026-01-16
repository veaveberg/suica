import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { translations } from './translations';

i18n
    .use(initReactI18next)
    .init({
        resources: {
            RU: { translation: translations.RU },
            EN: { translation: translations.EN },
            KA: { translation: translations.KA },
        },
        lng: 'RU',
        fallbackLng: 'EN',
        interpolation: {
            escapeValue: false,
        },
    });

export default i18n;
