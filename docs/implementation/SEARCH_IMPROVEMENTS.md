# Search Strategy Improvements

This document describes the improvements made to the folder search functionality to address issues #4 and #8.

## Issues Addressed

### Issue #4: Better Match Prioritization
**Problem**: When searching for "abc", the plugin would show "abc" along with all its subdirectories like "abc/xxx", "abc/yyy", etc., making it difficult to find the target folder.

**Solution**: Implemented intelligent parent-child deduplication that:
- Prioritizes parent folder matches over their children
- Completely excludes child folders unless they have additional keyword matches beyond what the parent has
- Only shows children when they contain additional matched keywords not found in the parent path

### Issue #8: Out-of-Order Keyword Matching
**Problem**: Search only worked when keywords were in the correct order. For example, searching "bar foo" would not match "foo/bar/baz".

**Solution**: Implemented keyword-based matching that:
- Splits the search query into space-separated keywords
- Matches keywords independently in any order
- Requires all keywords to be present in the folder path for a match

## Implementation Details

### Custom `getSuggestions` Method

The plugin now uses a custom `getSuggestions` method that overrides the default fuzzy search with a more sophisticated scoring system:

#### 1. Keyword Extraction
```typescript
const keywords = normalizedQuery.split(/\s+/).filter((k) => k.length > 0);
```
- Splits query by whitespace
- Filters out empty strings
- Allows matching keywords in any order

#### 2. Scoring System

Each folder is scored based on multiple factors:

**Keyword Match Bonuses:**
- **+100**: Keyword matches in folder name (not just parent path)
- **+200**: Exact folder name match
- **+50**: Folder name starts with keyword
- **+10**: Keyword only matches in parent path
- **+0 to +50**: Earlier matches in path get higher scores

**Path-Based Adjustments:**
- **-5 per level**: Penalty for nested depth (prefers shallower folders)
- **+0 to +100**: Bonus for shorter paths (more specific matches)

#### 3. Parent-Child Deduplication

After initial scoring, the algorithm applies deduplication:

```typescript
// Count total occurrences of all keywords in both parent and child
let parentOccurrences = 0;
let childOccurrences = 0;

for (const keyword of keywords) {
    // Count occurrences of this keyword in parent
    let pos = 0;
    while ((pos = parentLower.indexOf(keyword, pos)) !== -1) {
        parentOccurrences++;
        pos += keyword.length;
    }
    
    // Count occurrences of this keyword in child
    pos = 0;
    while ((pos = childLower.indexOf(keyword, pos)) !== -1) {
        childOccurrences++;
        pos += keyword.length;
    }
}

// If child doesn't have more keyword occurrences than parent, exclude it
if (childOccurrences <= parentOccurrences) {
    shouldExclude = true;
}
```

This ensures that when searching for "abc":
- "abc" is shown (1 occurrence)
- "abc/xxx" is completely hidden (still 1 occurrence of "abc")
- "abc/xxx/abc" would be shown (2 occurrences of "abc")

#### 4. Result Limiting

Results are sorted by final score and limited to the `maxResults` setting.

## Examples

### Example 1: Out-of-Order Keywords (Issue #8)
**Query:** "bar foo"

**Matches:**
- ✅ `foo/bar/baz` - Both keywords present
- ✅ `projects/foo/notes/bar` - Both keywords present
- ❌ `foo/test` - Missing "bar" keyword
- ❌ `bar/test` - Missing "foo" keyword

### Example 2: Parent-Child Prioritization (Issue #4)
**Query:** "abc"

**Before (old behavior):**
1. `abc` (score: 350)
2. `abc/xxx` (score: 340)
3. `abc/yyy` (score: 340)
4. `abc/zzz` (score: 340)
5. `projects/abc` (score: 150)

**After (new behavior):**
1. `abc` (score: 350)
2. `projects/abc` (score: 150)
3. (Other non-related folders...)

Note: `abc/xxx`, `abc/yyy`, `abc/zzz` are completely excluded from results

### Example 3: Additional Keyword in Child
**Query:** "abc test"

**Results:**
1. `abc/test` (score: 450) - Matches both keywords, shown
2. `abc` (score: 350) - Only matches "abc", shown
3. `projects/abc/test` (score: 340) - Matches both, shown
4. Other folders matching both keywords...

Note: `abc/test` is shown because it has 2 total keyword occurrences ("abc" + "test"), more than its parent `abc` which only has 1. However, `abc/notes` would be excluded because it still only has 1 occurrence of "abc", the same count as its parent.

### Example 4: Repeated Keywords
**Query:** "ai prompt"

**Folder Structure:**
- `AI/Prompt engineering` - Contains "ai" (1x) and "prompt" (1x) = 2 total occurrences
- `AI/Prompt engineering/Prompt engineering` - Contains "ai" (1x) and "prompt" (2x) = 3 total occurrences
- `AI/Prompt engineering/asset` - Contains "ai" (1x) and "prompt" (1x) = 2 total occurrences

**Results:**
1. `AI/Prompt engineering` - Shown (2 occurrences)
2. `AI/Prompt engineering/Prompt engineering` - Shown (3 occurrences, more than parent)
3. `AI/Prompt engineering/asset` - Hidden (2 occurrences, same as parent)

## Technical Notes

### Type Safety
- Added `FolderWithScore` interface for internal scoring
- Maintains compatibility with Obsidian's `FuzzyMatch<TFolder>` type
- Proper handling of separator items

### Debug Support
- All search operations respect the `debugMode` setting
- Logs query, keywords, and result counts when debug mode is enabled
- Useful for troubleshooting search behavior

### Performance Considerations
- Iterates through all folders once for scoring
- Uses Set for efficient parent path lookups
- Limits results to prevent UI overload
- Complexity: O(n * k) where n = folders, k = keywords

## Future Improvements

Potential enhancements for consideration:
1. **Fuzzy character matching**: Allow typos and approximate matches
2. **History-weighted scoring**: Boost scores for recently/frequently accessed folders
3. **Custom weights**: Let users adjust scoring parameters
4. **Regex support**: Enable advanced pattern matching
5. **Path segment prioritization**: Give higher weight to matches in specific segments
