import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RestaurantCardComponent } from './restaurant-card.component';
import type { Restaurant } from '../../../../domain/types/search.types';

describe('RestaurantCardComponent order buttons', () => {
  let fixture: ComponentFixture<RestaurantCardComponent>;
  let component: RestaurantCardComponent;
  let navigate: jest.Mock;

  const tenbisUrl = 'https://www.10bis.co.il/next/restaurants/menu/delivery/12345/test-restaurant';
  const woltUrl = 'https://wolt.com/he/isr/tel-aviv/restaurant/test';
  const mishlohaUrl = 'https://www.mishloha.co.il/now/r/test-restaurant-12345';

  const base: Restaurant = {
    id: '1',
    placeId: 'place1',
    name: 'Test Restaurant',
    address: '123 Test St',
    location: { lat: 32.0853, lng: 34.7818 }
  };

  function render(providers: Restaurant['providers']): void {
    fixture.componentRef.setInput('restaurant', { ...base, providers });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    navigate = jest.fn();
    await TestBed.configureTestingModule({
      imports: [RestaurantCardComponent],
      providers: [{ provide: Router, useValue: { navigate } }]
    }).compileComponents();

    fixture = TestBed.createComponent(RestaurantCardComponent);
    component = fixture.componentInstance;
  });

  it('shows Order on Wolt as a button when the Wolt URL is valid', () => {
    render({ wolt: { status: 'FOUND', url: woltUrl } });

    const button = orderControl('Order on Wolt');
    expect(button?.tagName).toBe('BUTTON');
    expect(button?.getAttribute('href')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Order via');
  });

  it('shows Order on 10bis as a link when the 10bis URL is valid', () => {
    render({ tenbis: { status: 'FOUND', url: tenbisUrl } });

    const link = orderControl('Order on 10bis');
    expect(link?.tagName).toBe('A');
    expect(link?.getAttribute('href')).toContain(tenbisUrl);
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('shows Order on Mishloha as a button when the Mishloha URL is valid', () => {
    render({ mishloha: { status: 'FOUND', url: mishlohaUrl } });

    const button = orderControl('Order on Mishloha');
    expect(button?.tagName).toBe('BUTTON');
  });

  it('omits an app with a missing or invalid URL', () => {
    render({
      wolt: { status: 'FOUND', url: 'https://example.com/not-wolt' },
      tenbis: { status: 'NOT_FOUND', url: null },
      mishloha: { status: 'FOUND', url: mishlohaUrl }
    });

    expect(orderControl('Order on Wolt')).toBeNull();
    expect(orderControl('Order on 10bis')).toBeNull();
    expect(orderControl('Order on Mishloha')).not.toBeNull();
  });

  it('renders no order row and no separators when no provider qualifies', () => {
    render(undefined);

    expect(fixture.nativeElement.querySelector('.order-buttons')).toBeNull();
    expect(fixture.nativeElement.querySelector('.provider-separator-tw')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Order via');
    expect(fixture.nativeElement.textContent).not.toContain('·');
  });

  it('places the order row above Navigate and Call', () => {
    render({
      wolt: { status: 'FOUND', url: woltUrl },
      tenbis: { status: 'FOUND', url: tenbisUrl },
      mishloha: { status: 'FOUND', url: mishlohaUrl }
    });

    const article = fixture.nativeElement.querySelector('article') as HTMLElement;
    const orderRow = article.querySelector('.order-buttons');
    const actionBar = article.querySelector('.action-bar');
    expect(orderRow).not.toBeNull();
    expect(actionBar).not.toBeNull();
    expect(orderRow!.compareDocumentPosition(actionBar!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(article.querySelector('.provider-separator-tw')).toBeNull();
  });

  it('does not select the card when an order button is pressed', () => {
    render({ wolt: { status: 'FOUND', url: woltUrl } });
    jest.spyOn(component.cardClick, 'emit');
    jest.spyOn(window, 'open').mockImplementation(() => null);

    orderControl('Order on Wolt')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(component.cardClick.emit).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  function orderControl(label: string): HTMLElement | null {
    const controls = fixture.nativeElement.querySelectorAll('.order-btn');
    return Array.from(controls).find((el) => (el as HTMLElement).textContent?.includes(label)) as HTMLElement | null ?? null;
  }
});
