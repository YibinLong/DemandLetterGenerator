import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DemandLetterList } from '../components/DemandLetterList';
import { DemandLetterGenerator } from '../components/DemandLetterGenerator';
import type { DemandLetterListItem } from '../types/demand-letter';

export function DemandLettersPage() {
  const navigate = useNavigate();
  const [showGenerator, setShowGenerator] = useState(false);

  const handleSelect = (letter: DemandLetterListItem) => {
    navigate(`/demand-letters/${letter.id}`);
  };

  const handleGenerationComplete = (demandLetterId: string) => {
    setShowGenerator(false);
    navigate(`/demand-letters/${demandLetterId}`);
  };

  if (showGenerator) {
    return (
      <div className="demand-letters-page">
        <button
          className="back-btn"
          onClick={() => setShowGenerator(false)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to List
        </button>
        <DemandLetterGenerator onGenerated={handleGenerationComplete} />

        <style>{`
          .back-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 20px;
            padding: 8px 16px;
            background: var(--bg-primary, #ffffff);
            border: 1px solid var(--border-primary, #e5e7eb);
            border-radius: 8px;
            font-size: 14px;
            color: var(--text-secondary, #6b7280);
            cursor: pointer;
            transition: all 0.15s;
          }

          .back-btn:hover {
            border-color: var(--color-primary, #3b82f6);
            color: var(--text-primary, #111827);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="demand-letters-page">
      <DemandLetterList
        onSelect={handleSelect}
        onCreateNew={() => setShowGenerator(true)}
      />
    </div>
  );
}

export default DemandLettersPage;
