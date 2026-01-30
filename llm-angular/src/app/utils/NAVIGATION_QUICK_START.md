# Navigation Utility - Quick Start

## One-Minute Guide

### Install
```typescript
import { buildNavigationUrl, openNavigation } from './navigation.util';
```

### Basic Usage
```typescript
// Build URL (manual opening):
const url = buildNavigationUrl({ placeId: 'ChIJ...' });
window.open(url, '_blank');

// Or use helper (automatic opening):
openNavigation({ placeId: 'ChIJ...' });
```

## Three Ways to Navigate

### Option 1: Place ID Only (Best)
```typescript
buildNavigationUrl({ 
  placeId: 'ChIJH3w7GaZMHRURkD-WwKJy-8E' 
})
// → https://maps.google.com/?q=place_id:ChIJH3w7GaZMHRURkD-WwKJy-8E
```

**Use when**: You have a Google Place ID (most accurate)

### Option 2: Coordinates Only
```typescript
buildNavigationUrl({ 
  lat: 32.0853, 
  lng: 34.7818 
})
// → https://maps.google.com/?q=32.0853,34.7818
```

**Use when**: No Place ID available

### Option 3: Both (Fallback)
```typescript
buildNavigationUrl({ 
  placeId: 'ChIJ...', 
  lat: 32.0853, 
  lng: 34.7818 
})
// → https://maps.google.com/?q=place_id:ChIJ...
// (Uses placeId, coordinates are fallback)
```

**Use when**: Maximum reliability needed

## Component Examples

### Angular
```typescript
@Component({
  selector: 'app-restaurant-card',
  template: `<button (click)="navigate()">🧭 Navigate</button>`
})
export class RestaurantCardComponent {
  @Input() restaurant!: Restaurant;

  navigate(): void {
    openNavigation({
      placeId: this.restaurant.placeId,
      lat: this.restaurant.location.lat,
      lng: this.restaurant.location.lng
    }, {
      name: this.restaurant.name
    });
  }
}
```

### React
```typescript
function RestaurantCard({ restaurant }) {
  const navigate = () => {
    openNavigation({
      placeId: restaurant.placeId,
      lat: restaurant.location.lat,
      lng: restaurant.location.lng
    }, {
      name: restaurant.name
    });
  };

  return <button onClick={navigate}>🧭 Navigate</button>;
}
```

## Key Features

✅ **Universal**: Works on desktop + mobile (no device detection)  
✅ **Free**: No API key, no billing  
✅ **Simple**: One function, two parameters  
✅ **Secure**: Opens in new tab with security flags  
✅ **Smart**: Prioritizes Place ID over coordinates  

## Error Handling

```typescript
try {
  const url = buildNavigationUrl({ 
    placeId: restaurant.placeId,
    lat: restaurant.location?.lat,
    lng: restaurant.location?.lng
  });
  window.open(url, '_blank', 'noopener,noreferrer');
} catch (error) {
  console.error('Cannot navigate:', error.message);
  // Show error to user
}
```

## Testing
```typescript
describe('Navigation', () => {
  it('builds URL with place ID', () => {
    const url = buildNavigationUrl({ placeId: 'ChIJ...' });
    expect(url).toContain('place_id:ChIJ...');
  });
});
```

## Full API Reference
See `NAVIGATION_UTILITY_API.md` for complete documentation.

---

**Questions?** Check the FAQ in `NAVIGATION_UTILITY_API.md`
