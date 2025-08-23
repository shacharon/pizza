import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'currencyIls', standalone: true })
export class CurrencyIlsPipe implements PipeTransform {
    transform(value: number | null | undefined): string {
        if (typeof value !== 'number' || !isFinite(value)) return '—';
        return `₪${value}`;
    }
}


