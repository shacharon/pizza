/**
 * Result State Engine (RSE)
 * Deterministic analyzer that examines search results and creates a ResponsePlan
 * RSE decides WHAT to do; ChatBack decides HOW to say it
 */

import type {
  ResponsePlan,
  ResponseScenario,
  ResultsSummary,
  FilterStats,
  TimingInfo,
  FallbackOption,
  SuggestedAction
} from '../types/response-plan.types.js';
import type { RestaurantResult, ParsedIntent, ResultGroup } from '../types/search.types.js';
import type { CityFilterResult } from '../filters/city-filter.service.js';

export class ResultStateEngine {
  
  /**
   * Main analysis method
   * Examines results and creates a comprehensive ResponsePlan
   */
  analyze(
    results: RestaurantResult[],
    intent: ParsedIntent,
    filterResult: CityFilterResult,
    confidence: number,
    groups?: ResultGroup[]
  ): ResponsePlan {
    const summary = this.summarizeResults(results, groups);
    const filters = this.extractFilterStats(filterResult);
    const timing = this.getCurrentTiming();
    const scenario = this.determineScenario(summary, intent, filters, confidence);
    const fallback = this.generateFallbackOptions(scenario, intent, filters, summary);
    const suggestedActions = this.generateSuggestedActions(scenario, intent, fallback, summary);
    const constraints = this.setGuardrails(scenario);
    
    console.log(`[RSE] Scenario: ${scenario}, Results: ${summary.total}, Fallbacks: ${fallback.length}`);
    
    return {
      scenario,
      results: summary,
      filters,
      timing,
      fallback,
      suggestedActions,
      constraints
    };
  }
  
  /**
   * Summarize result counts and statuses
   */
  private summarizeResults(results: RestaurantResult[], groups?: ResultGroup[]): ResultsSummary {
    const total = results.length;
    
    // Count exact vs nearby from groups if available
    let exact = 0;
    let nearby = 0;
    if (groups && groups.length > 0) {
      const exactGroup = groups.find(g => g.kind === 'EXACT');
      const nearbyGroup = groups.find(g => g.kind === 'NEARBY');
      exact = exactGroup?.results.length || 0;
      nearby = nearbyGroup?.results.length || 0;
    } else {
      exact = total;  // All results are "exact" if no grouping
      nearby = 0;
    }
    
    // Count timing statuses
    let openNow = 0;
    let closingSoon = 0;
    let closedToday = 0;
    let unknownHours = 0;
    
    results.forEach(r => {
      if (r.openNow === true) {
        openNow++;
        // TODO: Add "closing soon" detection if we have hours data
      } else if (r.openNow === false) {
        closedToday++;
      } else if (r.openNow === 'UNKNOWN') {
        unknownHours++;
      }
    });
    
    return {
      total,
      exact,
      nearby,
      openNow,
      closingSoon,
      closedToday,
      unknownHours
    };
  }
  
  /**
   * Extract filter statistics
   */
  private extractFilterStats(filterResult: CityFilterResult): FilterStats {
    const droppedCount = filterResult.dropped.length;
    const reasons = filterResult.stats.dropReasons;
    
    // Try to detect nearby city from dropped results
    // Look for city names in dropped result addresses
    let nearbyCity: string | undefined;
    let nearbyDistance: number | undefined;
    
    if (filterResult.dropped.length > 0) {
      // Get the first dropped result's city if available
      // This is a simple heuristic - could be improved
      const firstDropped = filterResult.dropped[0];
      if (firstDropped.address) {
        // Try to extract city name from address (simple approach)
        const addressParts = firstDropped.address.split(',');
        if (addressParts.length >= 2) {
          nearbyCity = addressParts[addressParts.length - 2]?.trim();
        }
      }
      
      // Calculate approximate distance if we have location
      if (firstDropped.location && (firstDropped as any).distanceKm) {
        nearbyDistance = (firstDropped as any).distanceKm;
      }
    }
    
    return {
      droppedCount,
      reasons,
      nearbyCity,
      nearbyDistance
    };
  }
  
  /**
   * Get current timing information
   */
  private getCurrentTiming(): TimingInfo {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    
    let timeOfDay: TimingInfo['timeOfDay'];
    if (hour >= 5 && hour < 12) {
      timeOfDay = 'morning';
    } else if (hour >= 12 && hour < 17) {
      timeOfDay = 'afternoon';
    } else if (hour >= 17 && hour < 22) {
      timeOfDay = 'evening';
    } else {
      timeOfDay = 'late_night';
    }
    
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    return {
      currentTime: now.toISOString(),
      timeOfDay,
      isWeekend
    };
  }
  
  /**
   * Determine the response scenario based on results and intent
   */
  private determineScenario(
    summary: ResultsSummary,
    intent: ParsedIntent,
    filters: FilterStats,
    confidence: number
  ): ResponseScenario {
    const { total, exact, nearby, closingSoon, closedToday, unknownHours } = summary;
    
    // Zero results scenarios
    if (total === 0) {
      if (nearby > 0 || filters.droppedCount > 0) {
        if (filters.nearbyCity) {
          return 'zero_different_city';
        }
        return 'zero_nearby_exists';
      }
      if (intent.filters && Object.keys(intent.filters).length > 0) {
        return 'constraint_too_strict';
      }
      return 'zero_nearby_exists';  // Generic zero
    }
    
    // Few results scenarios
    if (total < 3) {
      if (closingSoon === total) {
        return 'few_closing_soon';
      }
      if (closedToday === total) {
        return 'few_all_closed';
      }
    }
    
    // Missing information scenarios
    if (!intent.location?.city && !intent.location?.place) {
      return 'missing_location';
    }
    
    if (!intent.query || intent.query.length < 2) {
      return 'missing_query';
    }
    
    // Quality scenarios
    if (confidence < 0.6) {
      return 'low_confidence';
    }
    
    const unknownRate = unknownHours / total;
    if (unknownRate > 0.8 && total < 5) {
      return 'high_unknown_rate';
    }
    
    // Default: good results
    return 'exact_match';
  }
  
  /**
   * Generate fallback options based on scenario
   */
  private generateFallbackOptions(
    scenario: ResponseScenario,
    intent: ParsedIntent,
    filters: FilterStats,
    summary: ResultsSummary
  ): FallbackOption[] {
    const fallbacks: FallbackOption[] = [];
    
    switch (scenario) {
      case 'zero_nearby_exists':
        if (summary.nearby > 0) {
          fallbacks.push({
            type: 'expand_radius',
            label: intent.language === 'he' ? 'הרחב רדיוס (5 דק\' הליכה)' : 'Expand radius (5 min walk)',
            value: { radiusMeters: 500 },
            explanation: intent.language === 'he' 
              ? `${summary.nearby} מקומות במרחק הליכה קצר`
              : `${summary.nearby} places within walking distance`
          });
        }
        break;
        
      case 'zero_different_city':
        if (filters.nearbyCity) {
          fallbacks.push({
            type: 'nearby_city',
            label: intent.language === 'he' 
              ? `חפש ב${filters.nearbyCity}`
              : `Search in ${filters.nearbyCity}`,
            value: { city: filters.nearbyCity },
            explanation: intent.language === 'he'
              ? `${filters.droppedCount} מקומות ב${filters.nearbyCity} (${Math.round(filters.nearbyDistance || 0)} ק"מ)`
              : `${filters.droppedCount} places in ${filters.nearbyCity} (${Math.round(filters.nearbyDistance || 0)} km)`
          });
        }
        break;
        
      case 'constraint_too_strict':
        if (intent.filters && Object.keys(intent.filters).length > 0) {
          fallbacks.push({
            type: 'remove_constraint',
            label: intent.language === 'he' ? 'הסר מגבלות' : 'Remove constraints',
            value: { removeFilters: true },
            explanation: intent.language === 'he'
              ? 'אולי המגבלות צרות מדי'
              : 'Constraints might be too strict'
          });
        }
        break;
        
      case 'few_all_closed':
        fallbacks.push({
          type: 'show_closed',
          label: intent.language === 'he' ? 'הצג גם סגורים' : 'Show closed places',
          value: { includeClosedquery: intent.query },
          explanation: intent.language === 'he'
            ? 'אולי יפתחו מחר'
            : 'Might be open tomorrow'
        });
        break;
    }
    
    return fallbacks;
  }
  
  /**
   * Generate suggested actions (ordered by priority)
   */
  private generateSuggestedActions(
    scenario: ResponseScenario,
    intent: ParsedIntent,
    fallbacks: FallbackOption[],
    summary: ResultsSummary
  ): SuggestedAction[] {
    const actions: SuggestedAction[] = [];
    const isHebrew = intent.language === 'he';
    
    // Convert fallbacks to actions (high priority)
    fallbacks.forEach((fallback, index) => {
      actions.push({
        id: `fallback_${fallback.type}`,
        label: fallback.label,
        query: this.buildQueryFromFallback(fallback, intent),
        priority: 1
      });
    });
    
    // Add scenario-specific suggestions
    if (scenario === 'missing_location') {
      const cities = isHebrew 
        ? ['תל אביב', 'ירושלים', 'חיפה']
        : ['tel aviv', 'jerusalem', 'haifa'];
      
      cities.forEach((city, index) => {
        actions.push({
          id: `suggest_city_${index}`,
          label: `${intent.query} ${isHebrew ? 'ב' : 'in '}${city}`,
          query: `${intent.query} ${isHebrew ? 'ב' : 'in '}${city}`,
          priority: 2
        });
      });
    } else if (scenario === 'missing_query') {
      const cuisines = isHebrew 
        ? ['פיצה', 'סושי', 'איטלקי']
        : ['pizza', 'sushi', 'italian'];
      
      cuisines.forEach((cuisine, index) => {
        actions.push({
          id: `suggest_cuisine_${index}`,
          label: cuisine,
          query: cuisine,
          priority: 2
        });
      });
    }
    
    // Limit to 3-4 actions
    return actions.slice(0, 4);
  }
  
  /**
   * Build a new search query from a fallback option
   */
  private buildQueryFromFallback(fallback: FallbackOption, intent: ParsedIntent): string {
    const isHebrew = intent.language === 'he';
    
    switch (fallback.type) {
      case 'expand_radius':
        return intent.query || '';  // Same query, radius handled separately
        
      case 'nearby_city':
        return `${intent.query} ${isHebrew ? 'ב' : 'in '}${fallback.value.city}`;
        
      case 'remove_constraint':
        return intent.query || '';
        
      case 'show_closed':
        return intent.query || '';
        
      default:
        return intent.query || '';
    }
  }
  
  /**
   * Set guardrails for ChatBack based on scenario
   */
  private setGuardrails(scenario: ResponseScenario): ResponsePlan['constraints'] {
    // Default: require mentioning count and suggesting action
    const defaults = {
      mustMentionCount: true,
      mustSuggestAction: true,
      canMentionTiming: true,
      canMentionLocation: true
    };
    
    // Scenario-specific overrides
    switch (scenario) {
      case 'exact_match':
        return {
          ...defaults,
          mustMentionCount: false,  // Good results, no need to emphasize
          mustSuggestAction: false
        };
        
      case 'missing_location':
      case 'missing_query':
        return {
          ...defaults,
          canMentionTiming: false  // Not relevant
        };
        
      case 'few_closing_soon':
        return {
          ...defaults,
          canMentionTiming: true,
          mustMentionCount: true
        };
        
      default:
        return defaults;
    }
  }
}




