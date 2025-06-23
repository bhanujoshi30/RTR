import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function replaceDevanagariNumerals(input: string): string {
    if (!input) return input;
    const devanagariNumerals: { [key: string]: string } = {
        '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
        '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
    };
    return input.replace(/[०-९]/g, (match) => devanagariNumerals[match]);
}

// A simplified number to words converter for Indian Rupees.
// Handles numbers up to 99,99,99,999 (Ninety-Nine Crore...).

const translations = {
    en: {
        ones: ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'],
        teens: ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'],
        tens: ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'],
        crore: 'Crore',
        lakh: 'Lakh',
        thousand: 'Thousand',
        hundred: 'Hundred',
        rupeesOnly: 'Rupees Only',
        zero: 'Zero'
    },
    hi: {
        ones: ['', 'एक', 'दो', 'तीन', 'चार', 'पांच', 'छह', 'सात', 'आठ', 'नौ'],
        teens: ['दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस'],
        tens: ['', '', 'बीस', 'तीस', 'चालीस', 'पचास', 'साठ', 'सत्तर', 'अस्सी', 'नब्बे'],
        crore: 'करोड़',
        lakh: 'लाख',
        thousand: 'हजार',
        hundred: 'सौ',
        rupeesOnly: 'रुपये मात्र',
        zero: 'शून्य'
    }
};

function convertLessThanThousand(n: number, locale: 'en' | 'hi'): string {
    const { ones, teens, tens, hundred } = translations[locale];
    let result = '';
    if (n >= 100) {
        result += ones[Math.floor(n / 100)] + ` ${hundred} `;
        n %= 100;
    }
    if (n >= 20) {
        result += tens[Math.floor(n / 10)] + ' ';
        n %= 10;
    } else if (n >= 10) {
        result += teens[n - 10] + ' ';
        n = 0;
    }
    if (n > 0) {
        result += ones[n] + ' ';
    }
    return result.trim();
}

export function numberToWordsInr(num: number | null, locale: 'en' | 'hi' = 'en'): string {
    if (num === null || num === undefined) return '';
    if (num === 0) return `${translations[locale].zero} ${translations[locale].rupeesOnly}`;

    const { crore, lakh, thousand, rupeesOnly } = translations[locale];

    let words = '';
    const croreVal = Math.floor(num / 10000000);
    num %= 10000000;
    if (croreVal > 0) {
        words += convertLessThanThousand(croreVal, locale) + ` ${crore} `;
    }

    const lakhVal = Math.floor(num / 100000);
    num %= 100000;
    if (lakhVal > 0) {
        words += convertLessThanThousand(lakhVal, locale) + ` ${lakh} `;
    }

    const thousandVal = Math.floor(num / 1000);
    num %= 1000;
    if (thousandVal > 0) {
        words += convertLessThanThousand(thousandVal, locale) + ` ${thousand} `;
    }

    if (num > 0) {
        words += convertLessThanThousand(num, locale);
    }
    
    // Convert any resulting numbers back to arabic numerals if locale is hindi
    const finalWords = locale === 'hi' ? replaceDevanagariNumerals(words) : words;
    
    return finalWords.trim().replace(/\s+/g, ' ') + ` ${rupeesOnly}`;
}
