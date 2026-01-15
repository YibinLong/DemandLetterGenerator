import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listTemplates,
  getTemplateAnalytics,
  seedDefaultTemplates,
  formatCategory,
} from '../lib/templates';
import { formatRelativeTime } from '../lib/demand-letters';
import type {
  TemplateListItem,
  TemplateListResponse,
  TemplateAnalyticsResponse,
} from '../types/template';
import { TEMPLATE_CATEGORIES } from '../types/template';

interface FirmTemplateLibraryProps {
  onSelectTemplate?: (template: TemplateListItem) => void;
  onEditTemplate?: (template: TemplateListItem) => void;
  onCreateTemplate?: () => void;
  isAdmin?: boolean;
}

type ViewMode = 'library' | 'analytics';
type LibraryFilter = 'all' | 'approved' | 'shared' | 'by-category';

export function FirmTemplateLibrary({
  onSelectTemplate,
  onEditTemplate,
  onCreateTemplate,
  isAdmin = false,
}: FirmTemplateLibraryProps) {
  const queryClient = useQueryClient();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('library');
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('approved');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch approved/shared templates for the library view
  const { data: templatesData, isLoading: templatesLoading } = useQuery<TemplateListResponse>({
    queryKey: ['firm-templates', libraryFilter, selectedCategory, searchQuery],
    queryFn: () => {
      const params: Parameters<typeof listTemplates>[0] = {
        limit: 100,
        offset: 0,
      };

      if (searchQuery) {
        params.search = searchQuery;
      }

      if (libraryFilter === 'approved') {
        params.is_approved = true;
        params.is_shared = true;
      } else if (libraryFilter === 'shared') {
        params.is_shared = true;
      } else if (libraryFilter === 'by-category' && selectedCategory) {
        params.category = selectedCategory;
        params.is_shared = true;
      }

      return listTemplates(params);
    },
    enabled: viewMode === 'library',
  });

  // Fetch analytics
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery<TemplateAnalyticsResponse>({
    queryKey: ['template-analytics'],
    queryFn: getTemplateAnalytics,
    enabled: viewMode === 'analytics',
  });

  // Seed defaults mutation
  const seedMutation = useMutation({
    mutationFn: seedDefaultTemplates,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firm-templates'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['template-analytics'] });
    },
  });

  const handleSeedDefaults = useCallback(() => {
    if (window.confirm('This will add default starter templates to your firm library. Continue?')) {
      seedMutation.mutate();
    }
  }, [seedMutation]);

  // Group templates by category for display
  const templatesByCategory = templatesData?.templates.reduce((acc, template) => {
    const cat = template.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(template);
    return acc;
  }, {} as Record<string, TemplateListItem[]>) || {};

  return (
    <div className="firm-template-library">
      {/* Header */}
      <div className="library-header">
        <div className="header-title">
          <h2>Firm Template Library</h2>
          <p className="subtitle">
            Browse and use approved templates for your demand letters
          </p>
        </div>
        <div className="header-actions">
          {onCreateTemplate && (
            <button onClick={onCreateTemplate} className="create-button">
              + Create Template
            </button>
          )}
          {isAdmin && (
            <button
              onClick={handleSeedDefaults}
              className="seed-button"
              disabled={seedMutation.isPending}
            >
              {seedMutation.isPending ? 'Adding...' : 'Add Starter Templates'}
            </button>
          )}
        </div>
      </div>

      {/* Seed result message */}
      {seedMutation.isSuccess && seedMutation.data && (
        <div className="seed-result success">
          Added {seedMutation.data.total_created} template(s).
          {seedMutation.data.total_skipped > 0 && (
            <span> ({seedMutation.data.total_skipped} already existed)</span>
          )}
        </div>
      )}
      {seedMutation.isError && (
        <div className="seed-result error">
          Failed to add starter templates. Please try again.
        </div>
      )}

      {/* View Toggle */}
      <div className="view-toggle">
        <button
          className={`toggle-button ${viewMode === 'library' ? 'active' : ''}`}
          onClick={() => setViewMode('library')}
        >
          Template Library
        </button>
        <button
          className={`toggle-button ${viewMode === 'analytics' ? 'active' : ''}`}
          onClick={() => setViewMode('analytics')}
        >
          Usage Analytics
        </button>
      </div>

      {/* Library View */}
      {viewMode === 'library' && (
        <div className="library-view">
          {/* Filters */}
          <div className="library-filters">
            <div className="filter-buttons">
              <button
                className={`filter-button ${libraryFilter === 'approved' ? 'active' : ''}`}
                onClick={() => setLibraryFilter('approved')}
              >
                Approved
              </button>
              <button
                className={`filter-button ${libraryFilter === 'shared' ? 'active' : ''}`}
                onClick={() => setLibraryFilter('shared')}
              >
                All Shared
              </button>
              <button
                className={`filter-button ${libraryFilter === 'by-category' ? 'active' : ''}`}
                onClick={() => setLibraryFilter('by-category')}
              >
                By Category
              </button>
              <button
                className={`filter-button ${libraryFilter === 'all' ? 'active' : ''}`}
                onClick={() => setLibraryFilter('all')}
              >
                All Templates
              </button>
            </div>

            {libraryFilter === 'by-category' && (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="category-select"
              >
                <option value="">Select Category</option>
                {TEMPLATE_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}

            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          {/* Loading */}
          {templatesLoading && (
            <div className="loading-state">
              <div className="spinner" />
              Loading templates...
            </div>
          )}

          {/* Empty State */}
          {!templatesLoading && templatesData?.templates.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">📁</div>
              <h3>No templates found</h3>
              {libraryFilter === 'approved' ? (
                <p>No approved templates yet. Ask an admin to approve shared templates.</p>
              ) : libraryFilter === 'by-category' && !selectedCategory ? (
                <p>Select a category to view templates.</p>
              ) : (
                <p>No templates match your criteria.</p>
              )}
              {isAdmin && (
                <button onClick={handleSeedDefaults} className="empty-action-button">
                  Add Starter Templates
                </button>
              )}
            </div>
          )}

          {/* Template Grid by Category */}
          {!templatesLoading && templatesData && templatesData.templates.length > 0 && (
            <div className="templates-by-category">
              {Object.entries(templatesByCategory).map(([category, templates]) => (
                <div key={category} className="category-section">
                  <h3 className="category-title">
                    {category}
                    <span className="category-count">{templates.length}</span>
                  </h3>
                  <div className="templates-grid">
                    {templates.map(template => (
                      <div
                        key={template.id}
                        className="template-card"
                        onClick={() => onSelectTemplate?.(template)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            onSelectTemplate?.(template);
                          }
                        }}
                      >
                        <div className="card-badges">
                          {template.is_approved && (
                            <span className="badge approved">Approved</span>
                          )}
                          {!template.is_approved && template.is_shared && (
                            <span className="badge shared">Shared</span>
                          )}
                        </div>
                        <h4 className="card-title">{template.name}</h4>
                        {template.description && (
                          <p className="card-description">{template.description}</p>
                        )}
                        <div className="card-meta">
                          <span className="placeholder-count">
                            {template.placeholders.length} fields
                          </span>
                          <span className="creator">
                            by {template.creator.name}
                          </span>
                        </div>
                        <div className="card-footer">
                          <span className="updated">
                            Updated {formatRelativeTime(template.updated_at)}
                          </span>
                          {onEditTemplate && (
                            <button
                              className="edit-link"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditTemplate(template);
                              }}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Analytics View */}
      {viewMode === 'analytics' && (
        <div className="analytics-view">
          {analyticsLoading && (
            <div className="loading-state">
              <div className="spinner" />
              Loading analytics...
            </div>
          )}

          {!analyticsLoading && analyticsData && (
            <>
              {/* Summary Cards */}
              <div className="analytics-summary">
                <div className="stat-card">
                  <div className="stat-value">{analyticsData.summary.total_templates}</div>
                  <div className="stat-label">Total Templates</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{analyticsData.summary.shared_templates}</div>
                  <div className="stat-label">Shared</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{analyticsData.summary.approved_templates}</div>
                  <div className="stat-label">Approved</div>
                </div>
                <div className="stat-card highlight">
                  <div className="stat-value">{analyticsData.usage_statistics.template_adoption_rate}%</div>
                  <div className="stat-label">Adoption Rate</div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="analytics-section">
                <h3>Recent Activity (Last 30 Days)</h3>
                <div className="activity-stats">
                  <div className="activity-item">
                    <span className="activity-value">
                      {analyticsData.recent_activity.templates_created_last_30_days}
                    </span>
                    <span className="activity-label">Templates Created</span>
                  </div>
                  <div className="activity-item">
                    <span className="activity-value">
                      {analyticsData.recent_activity.templates_updated_last_30_days}
                    </span>
                    <span className="activity-label">Templates Updated</span>
                  </div>
                </div>
              </div>

              {/* Top Templates */}
              <div className="analytics-section">
                <h3>Most Used Templates</h3>
                {analyticsData.top_templates.length === 0 ? (
                  <p className="no-data">No template usage data yet.</p>
                ) : (
                  <div className="top-templates-list">
                    {analyticsData.top_templates.map((template, index) => (
                      <div key={template.id} className="top-template-item">
                        <span className="rank">#{index + 1}</span>
                        <div className="template-info">
                          <span className="template-name">{template.name}</span>
                          <span className="template-category">
                            {formatCategory(template.category)}
                          </span>
                        </div>
                        <div className="template-stats">
                          <span className="usage-count">
                            {template.usage_count} use{template.usage_count !== 1 ? 's' : ''}
                          </span>
                          {template.last_used_at && (
                            <span className="last-used">
                              Last: {formatRelativeTime(template.last_used_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Category Breakdown */}
              <div className="analytics-section">
                <h3>Templates by Category</h3>
                <div className="category-breakdown">
                  {analyticsData.category_breakdown.map(item => (
                    <div key={item.category} className="category-bar-item">
                      <span className="category-name">{item.category}</span>
                      <div className="category-bar-container">
                        <div
                          className="category-bar"
                          style={{
                            width: `${Math.min(100, (item.count / analyticsData.summary.total_templates) * 100)}%`
                          }}
                        />
                      </div>
                      <span className="category-count-value">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Templates by Creator */}
              {analyticsData.templates_by_creator.length > 0 && (
                <div className="analytics-section">
                  <h3>Top Contributors</h3>
                  <div className="contributors-list">
                    {analyticsData.templates_by_creator.map(creator => (
                      <div key={creator.user_id} className="contributor-item">
                        <div className="contributor-info">
                          <span className="contributor-name">{creator.name}</span>
                          <span className="contributor-role">{creator.role}</span>
                        </div>
                        <div className="contributor-stats">
                          <span>{creator.template_count} templates</span>
                          <span className="shared-stat">
                            ({creator.shared_count} shared)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Usage Statistics */}
              <div className="analytics-section">
                <h3>Overall Usage</h3>
                <div className="usage-stats-grid">
                  <div className="usage-stat">
                    <span className="usage-value">
                      {analyticsData.usage_statistics.total_demand_letters}
                    </span>
                    <span className="usage-label">Total Demand Letters</span>
                  </div>
                  <div className="usage-stat">
                    <span className="usage-value">
                      {analyticsData.usage_statistics.demand_letters_with_template}
                    </span>
                    <span className="usage-label">Created with Templates</span>
                  </div>
                  <div className="usage-stat">
                    <span className="usage-value">
                      {analyticsData.usage_statistics.unique_templates_used}
                    </span>
                    <span className="usage-label">Unique Templates Used</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        .firm-template-library {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 1200px;
          margin: 0 auto;
        }

        .library-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
        }

        .header-title h2 {
          margin: 0 0 4px;
          font-size: 24px;
          color: #111827;
        }

        .subtitle {
          margin: 0;
          color: #6b7280;
          font-size: 14px;
        }

        .header-actions {
          display: flex;
          gap: 12px;
        }

        .create-button {
          padding: 10px 20px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .create-button:hover {
          background: #2563eb;
        }

        .seed-button {
          padding: 10px 20px;
          background: #059669;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .seed-button:hover {
          background: #047857;
        }

        .seed-button:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }

        .seed-result {
          padding: 12px 16px;
          border-radius: 6px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .seed-result.success {
          background: #d1fae5;
          color: #065f46;
        }

        .seed-result.error {
          background: #fee2e2;
          color: #991b1b;
        }

        .view-toggle {
          display: flex;
          gap: 4px;
          margin-bottom: 24px;
          background: #f3f4f6;
          padding: 4px;
          border-radius: 8px;
          width: fit-content;
        }

        .toggle-button {
          padding: 10px 20px;
          background: transparent;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.15s;
        }

        .toggle-button:hover {
          color: #374151;
        }

        .toggle-button.active {
          background: white;
          color: #111827;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .library-filters {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
          flex-wrap: wrap;
          align-items: center;
        }

        .filter-buttons {
          display: flex;
          gap: 4px;
          background: #f3f4f6;
          padding: 4px;
          border-radius: 6px;
        }

        .filter-button {
          padding: 8px 16px;
          background: transparent;
          border: none;
          border-radius: 4px;
          font-size: 13px;
          color: #6b7280;
          cursor: pointer;
        }

        .filter-button:hover {
          color: #374151;
        }

        .filter-button.active {
          background: white;
          color: #111827;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .category-select {
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          background: white;
        }

        .search-input {
          padding: 8px 14px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          flex: 1;
          min-width: 200px;
        }

        .search-input:focus {
          outline: none;
          border-color: #3b82f6;
        }

        .loading-state {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px;
          color: #6b7280;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid #e5e7eb;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .empty-state {
          text-align: center;
          padding: 48px 24px;
          color: #6b7280;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .empty-state h3 {
          margin: 0 0 8px;
          color: #374151;
        }

        .empty-state p {
          margin: 0 0 16px;
        }

        .empty-action-button {
          padding: 10px 20px;
          background: #059669;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        }

        .templates-by-category {
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .category-section {
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 24px;
        }

        .category-section:last-child {
          border-bottom: none;
        }

        .category-title {
          margin: 0 0 16px;
          font-size: 18px;
          color: #374151;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .category-count {
          background: #e5e7eb;
          color: #6b7280;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: normal;
        }

        .templates-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .template-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .template-card:hover {
          border-color: #3b82f6;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .template-card:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .card-badges {
          display: flex;
          gap: 6px;
          margin-bottom: 10px;
        }

        .badge {
          padding: 3px 8px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 500;
        }

        .badge.approved {
          background: #d1fae5;
          color: #059669;
        }

        .badge.shared {
          background: #fef3c7;
          color: #d97706;
        }

        .card-title {
          margin: 0 0 6px;
          font-size: 15px;
          font-weight: 600;
          color: #111827;
        }

        .card-description {
          margin: 0 0 12px;
          font-size: 13px;
          color: #6b7280;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .card-meta {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #9ca3af;
          margin-bottom: 12px;
        }

        .placeholder-count {
          background: #f3f4f6;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 12px;
          border-top: 1px solid #f3f4f6;
        }

        .updated {
          font-size: 12px;
          color: #9ca3af;
        }

        .edit-link {
          background: none;
          border: none;
          color: #3b82f6;
          font-size: 13px;
          cursor: pointer;
        }

        .edit-link:hover {
          text-decoration: underline;
        }

        /* Analytics Styles */
        .analytics-summary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 32px;
        }

        .stat-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 20px;
          text-align: center;
        }

        .stat-card.highlight {
          background: #eff6ff;
          border-color: #bfdbfe;
        }

        .stat-value {
          font-size: 32px;
          font-weight: 700;
          color: #111827;
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 14px;
          color: #6b7280;
        }

        .analytics-section {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 20px;
        }

        .analytics-section h3 {
          margin: 0 0 16px;
          font-size: 16px;
          color: #374151;
        }

        .no-data {
          color: #9ca3af;
          font-style: italic;
        }

        .activity-stats {
          display: flex;
          gap: 32px;
        }

        .activity-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .activity-value {
          font-size: 24px;
          font-weight: 600;
          color: #111827;
        }

        .activity-label {
          font-size: 14px;
          color: #6b7280;
        }

        .top-templates-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .top-template-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px;
          background: #f9fafb;
          border-radius: 8px;
        }

        .rank {
          font-size: 14px;
          font-weight: 600;
          color: #6b7280;
          min-width: 24px;
        }

        .template-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .template-name {
          font-size: 14px;
          font-weight: 500;
          color: #111827;
        }

        .template-category {
          font-size: 12px;
          color: #6b7280;
        }

        .template-stats {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .usage-count {
          font-size: 14px;
          font-weight: 500;
          color: #059669;
        }

        .last-used {
          font-size: 11px;
          color: #9ca3af;
        }

        .category-breakdown {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .category-bar-item {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .category-name {
          font-size: 14px;
          color: #374151;
          min-width: 140px;
        }

        .category-bar-container {
          flex: 1;
          height: 20px;
          background: #f3f4f6;
          border-radius: 4px;
          overflow: hidden;
        }

        .category-bar {
          height: 100%;
          background: #3b82f6;
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .category-count-value {
          font-size: 14px;
          font-weight: 500;
          color: #111827;
          min-width: 32px;
          text-align: right;
        }

        .contributors-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .contributor-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: #f9fafb;
          border-radius: 8px;
        }

        .contributor-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .contributor-name {
          font-size: 14px;
          font-weight: 500;
          color: #111827;
        }

        .contributor-role {
          font-size: 12px;
          color: #6b7280;
          text-transform: capitalize;
        }

        .contributor-stats {
          font-size: 14px;
          color: #374151;
        }

        .shared-stat {
          color: #9ca3af;
          font-size: 12px;
        }

        .usage-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .usage-stat {
          text-align: center;
          padding: 16px;
          background: #f9fafb;
          border-radius: 8px;
        }

        .usage-value {
          display: block;
          font-size: 24px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 4px;
        }

        .usage-label {
          font-size: 13px;
          color: #6b7280;
        }

        @media (max-width: 768px) {
          .library-header {
            flex-direction: column;
          }

          .header-actions {
            width: 100%;
          }

          .header-actions button {
            flex: 1;
          }

          .analytics-summary {
            grid-template-columns: repeat(2, 1fr);
          }

          .usage-stats-grid {
            grid-template-columns: 1fr;
          }

          .library-filters {
            flex-direction: column;
            align-items: stretch;
          }

          .filter-buttons {
            overflow-x: auto;
          }

          .search-input {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

export default FirmTemplateLibrary;
