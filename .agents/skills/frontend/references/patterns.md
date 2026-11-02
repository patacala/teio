# Frontend Reference Patterns

## Component Library (src/components/ui/)

| Component | Import | Never use |
|-----------|--------|-----------|
| Select/SelectTrigger/SelectContent/SelectItem | `@/components/ui/select` | `<select>` |
| Dialog/DialogContent/DialogHeader/DialogTitle | `@/components/ui/dialog` | `<dialog>` |
| Button | `@/components/ui/button` | `<button>` with manual classes |
| Input | `@/components/ui/input` | `<input>` native |
| Badge | `@/components/ui/badge` | manual `<span>` pills |
| Card | `@/components/ui/card` | manual `<div>` with border |
| Skeleton | `@/components/ui/skeleton` | manual shimmer divs |
| Drawer | `@/components/ui/drawer` | custom slide panels |
| Tooltip | `@/components/ui/tooltip` | title attribute |
| Tabs | `@/components/ui/tabs` | manual tab state |
| Avatar | `@/components/ui/avatar` | manual rounded div |

## Data Fetching Pattern

```typescript
// Service — only HTTP
export const contactsService = {
  getContacts: (params?: ContactListParams) =>
    authClient.get<ContactsPage>(`/contacts?${qs}`),
};

// Hook — only React Query
export function useContacts(params?: ContactListParams) {
  return useQuery({
    queryKey: ['contacts', params],
    queryFn: () => contactsService.getContacts(params),
    staleTime: 30_000,
  });
}

// Component — only consumes hook
const { data, isLoading } = useContacts({ search });
```

## authClient API

```typescript
authClient.get<T>(path)       // GET
authClient.post<T>(path, body) // POST
authClient.patch<T>(path, body) // PATCH
authClient.delete<void>(path)   // DELETE (safe for 204)
// Responses auto-unwrapped from { data: T } envelope
```

## Framer Motion

```typescript
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};
// Use AnimatePresence for mount/unmount, layout prop for size transitions
```

## Avatar Pattern

```tsx
<div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
  {getInitials(fullName)}
</div>
```

## SOLID in Frontend

| Principle | Rule |
|-----------|------|
| S | One hook per domain. One component per visual concern. |
| O | Extend via className + CVA variants. Never modify base ui/ component. |
| L | Custom hooks return same shape as React Query (data, isLoading, error). |
| I | Minimal props. Don't pass entire object when only 2 fields needed. |
| D | Components → hooks → services → authClient. Never skip layers. |

## Navigation

- Sidebar sections: MAIN, CONFIGURATION, ADMIN
- Admin pages: role check via `useCurrentUser` hook
- Navigation: `useRouter().push(href)` — never `<a href>`
