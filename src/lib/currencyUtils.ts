// A simplified number to words converter for Indian Rupees.
// Handles numbers up to 99,99,99,999 (Ninety-Nine Crore...).

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertLessThanThousand(n: number): string {
    let result = '';
    if (n >= 100) {
        result += ones[Math.floor(n / 100)] + ' Hundred ';
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

export function numberToWordsInr(num: number): string {
    if (num === 0) return 'Zero Rupees Only';

    let words = '';
    const crore = Math.floor(num / 10000000);
    num %= 10000000;
    if (crore > 0) {
        words += convertLessThanThousand(crore) + ' Crore ';
    }

    const lakh = Math.floor(num / 100000);
    num %= 100000;
    if (lakh > 0) {
        words += convertLessThanThousand(lakh) + ' Lakh ';
    }

    const thousand = Math.floor(num / 1000);
    num %= 1000;
    if (thousand > 0) {
        words += convertLessThanThousand(thousand) + ' Thousand ';
    }

    if (num > 0) {
        words += convertLessThanThousand(num);
    }
    
    return words.trim().replace(/\s+/g, ' ') + ' Rupees Only';
}
