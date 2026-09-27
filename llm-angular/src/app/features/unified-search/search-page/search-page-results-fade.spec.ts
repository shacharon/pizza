import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { SearchPageComponent } from './search-page.component';
import { SearchFacade } from '../../../facades/search.facade';
import { SearchStateHandler } from '../../../facades/search-state.facade';
import { InputStateMachine } from '../../../services/input-state-machine.service';
import { LocationService } from '../../../services/location.service';
import { PwaInstallService } from '../../../services/pwa-install.service';
import { I18nService } from '../../../core/services/i18n.service';
import type { Restaurant } from '../../../domain/types/search.types';

describe('SearchPageComponent results fade', () => {
  let component: SearchPageComponent;
  const search = jest.fn();
  const onChipClick = jest.fn();
  const onSelectRecent = jest.fn();
  const selectRestaurant = jest.fn();

  beforeEach(() => {
    search.mockClear();
    onChipClick.mockClear();
    onSelectRecent.mockClear();
    selectRestaurant.mockClear();

    const facade = {
      requestId: () => null,
      response: () => null,
      results: () => [],
      search,
      onChipClick,
      onSelectRecent,
      selectRestaurant,
      cleanupExpiredActions: jest.fn(),
      restoreStateFromParams: jest.fn()
    };

    TestBed.overrideComponent(SearchPageComponent, {
      set: {
        providers: [
          { provide: SearchFacade, useValue: facade },
          { provide: SearchStateHandler, useValue: { setSort: jest.fn(), setActiveFilterIds: jest.fn() } }
        ]
      }
    });

    TestBed.configureTestingModule({
      imports: [SearchPageComponent],
      providers: [
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: { subscribe: () => ({ unsubscribe() {} }) } }
        },
        { provide: InputStateMachine, useValue: {} },
        {
          provide: LocationService,
          useValue: { state: () => 'OFF', location: () => null, blockedRetries: () => 0 }
        },
        { provide: PwaInstallService, useValue: {} },
        { provide: I18nService, useValue: { t: (key: string) => key } }
      ]
    });

    component = TestBed.createComponent(SearchPageComponent).componentInstance;
  });

  it('starts ready to fade the first result list', () => {
    expect(component.fadeOnAppear()).toBe(true);
  });

  it('keeps the fade on for a new search and a recent search', () => {
    component.fadeOnAppear.set(false);

    component.onSearch('pizza');
    expect(component.fadeOnAppear()).toBe(true);
    expect(search).toHaveBeenCalledWith('pizza');

    component.fadeOnAppear.set(false);
    component.onRecentSearchClick('sushi');
    expect(component.fadeOnAppear()).toBe(true);
    expect(onSelectRecent).toHaveBeenCalledWith('sushi');
  });

  it('turns the fade off for a chip and leaves it alone for load more and card selection', () => {
    component.onChipClick('opennow');
    expect(component.fadeOnAppear()).toBe(false);
    expect(onChipClick).toHaveBeenCalledWith('opennow');

    component.loadMore();
    expect(component.fadeOnAppear()).toBe(false);

    component.onCardClick({ id: '1', name: 'Amore Mio' } as Restaurant);
    expect(component.fadeOnAppear()).toBe(false);
    expect(selectRestaurant).toHaveBeenCalled();
  });
});
