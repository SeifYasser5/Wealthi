import { PageTitle } from '../../components/PageHeader'
import { QueryState } from '../../components/QueryState'
import { useCategories } from '../../hooks/useCategories'
import { AddCategoryForm } from './components/AddCategoryForm'
import { CategoryList } from './components/CategoryList'
import { SuggestedCategories } from './components/SuggestedCategories'

export function CategoriesPage() {
  const categories = useCategories()

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-4 md:flex md:h-[calc(100dvh-4rem-1px)] md:flex-col">
      <header className="mb-6 flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <PageTitle>Categories</PageTitle>
          <p className="mt-1 text-sm text-subtle">
            What Spending groups your transactions into. A transaction counts towards the category you gave it, else its
            merchant’s. Every category list follows this order.
          </p>
        </div>
        <AddCategoryForm />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <SuggestedCategories />
        <QueryState
          query={categories}
          isEmpty={(data) => data.categories.length === 0}
          errorMessage="Could not load categories."
          emptyMessage="No categories yet. Add your first one above."
        >
          {(data) => <CategoryList categories={data.categories} />}
        </QueryState>
      </div>
    </div>
  )
}
