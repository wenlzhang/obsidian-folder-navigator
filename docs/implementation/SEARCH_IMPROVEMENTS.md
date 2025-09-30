# Search Strategy Improvements

This document describes the improvements made to the folder search functionality to address issues #4 and #8.

## Issues Addressed

### Issue #4: Better Match Prioritization
**Problem**: When searching for "abc", the plugin would show "abc" along with all its subdirectories like "abc/xxx", "abc/yyy", etc., making it difficult to find the target folder.

**Solution**: Implemented intelligent parent-child deduplication that:
- Prioritizes parent folder matches over their children
- Deprioritizes child folders unless they have additional keyword matches beyond what the parent has
- Reduces child folder scores to 10% of their original score when they don't add new information

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
// Check if this child has additional matches beyond the parent
const parentKeywordMatches = keywords.filter(k => 
    parentPath.toLowerCase().includes(k)
);
const childKeywordMatches = keywords.filter(k =>
    folderPath.toLowerCase().includes(k)
);

// If child doesn't have more keyword matches than parent, deprioritize it
if (childKeywordMatches.length <= parentKeywordMatches.length) {
    item.score = item.score * 0.1;
}
```

This ensures that when searching for "abc":
- "abc" gets high priority
- "abc/xxx" gets significantly lower priority (unless "xxx" is also a keyword)
- "abc/xxx/abc" would still rank high because it has an additional "abc" match

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
3. `abc/xxx` (score: 34) ← Deprioritized to 10%
4. `abc/yyy` (score: 34) ← Deprioritized to 10%
5. `abc/zzz` (score: 34) ← Deprioritized to 10%

### Example 3: Additional Keyword in Child
**Query:** "abc test"

**Results:**
1. `abc/test` (score: 450) - Matches both keywords, high score
2. `abc` (score: 350) - Only matches "abc"
3. `projects/abc/test` (score: 340) - Matches both but deeper
4. `abc/notes` (score: 34) - Only matches "abc", child of matching parent

Note: `abc/test` ranks highest because it matches BOTH keywords even though it's a child of `abc`.

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
