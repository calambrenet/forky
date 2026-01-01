import type { FC } from 'react';
import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Star, Send } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getVersion } from '@tauri-apps/api/app';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import './FeedbackModal.css';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StarRatingProps {
  value: number;
  onChange: (rating: number) => void;
}

const StarRating: FC<StarRatingProps> = ({ value, onChange }) => {
  const [hoverValue, setHoverValue] = useState(0);

  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`star-btn ${star <= (hoverValue || value) ? 'active' : ''}`}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHoverValue(star)}
          onMouseLeave={() => setHoverValue(0)}
        >
          <Star size={24} fill={star <= (hoverValue || value) ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  );
};

export const FeedbackModal: FC<FeedbackModalProps> = memo(({ isOpen, onClose }) => {
  const { t, i18n } = useTranslation();

  const [rating, setRating] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [comments, setComments] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [osInfo, setOsInfo] = useState('');
  const [ratingError, setRatingError] = useState(false);

  // Get system info on mount
  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        const ver = await getVersion();
        setAppVersion(ver);
      } catch {
        setAppVersion('unknown');
      }

      // Use navigator for OS info
      try {
        const userAgent = navigator.userAgent;
        let os = 'Unknown';
        if (userAgent.includes('Win')) os = 'Windows';
        else if (userAgent.includes('Mac')) os = 'macOS';
        else if (userAgent.includes('Linux')) os = 'Linux';
        setOsInfo(os);
      } catch {
        setOsInfo('unknown');
      }
    };

    if (isOpen) {
      fetchSystemInfo();
    }
  }, [isOpen]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setRating(0);
      setName('');
      setEmail('');
      setComments('');
      setRatingError(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    // Validate rating
    if (rating === 0) {
      setRatingError(true);
      return;
    }

    // Build email body
    const ratingText = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    const body = [
      `Rating: ${ratingText} (${rating}/5)`,
      '',
      `Name: ${name || 'Not provided'}`,
      `Email: ${email || 'Not provided'}`,
      '',
      'Comments:',
      comments || 'No comments provided',
      '',
      '---',
      'System Information:',
      `App Version: ${appVersion}`,
      `OS: ${osInfo}`,
      `Language: ${i18n.language}`,
    ].join('\n');

    const subject = `Forky Feedback - ${rating} stars`;
    const mailtoUrl = `mailto:forky@codefriends.es?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    try {
      await openUrl(mailtoUrl);
      onClose();
    } catch (error) {
      console.error('Failed to open email client:', error);
    }
  };

  const handleRatingChange = (newRating: number) => {
    setRating(newRating);
    setRatingError(false);
  };

  const isSubmitDisabled = rating === 0 || !comments.trim();

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader
        icon={<MessageSquare size={24} />}
        title={t('feedback.title')}
        description={t('feedback.description')}
      />
      <ModalBody>
        <ModalRow label={t('feedback.rating')}>
          <div className="rating-container">
            <StarRating value={rating} onChange={handleRatingChange} />
            {ratingError && <span className="rating-error">{t('feedback.ratingRequired')}</span>}
          </div>
        </ModalRow>

        <ModalRow label={t('feedback.name')}>
          <input
            type="text"
            className="feedback-input"
            placeholder={t('feedback.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </ModalRow>

        <ModalRow label={t('feedback.email')}>
          <input
            type="email"
            className="feedback-input"
            placeholder={t('feedback.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </ModalRow>

        <ModalRow label={t('feedback.comments')}>
          <textarea
            className="feedback-textarea"
            placeholder={t('feedback.commentsPlaceholder')}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={4}
          />
        </ModalRow>
      </ModalBody>

      <ModalFooter>
        <button className="btn-cancel" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="btn-primary" onClick={handleSubmit} disabled={isSubmitDisabled}>
          <Send size={14} />
          {t('feedback.send')}
        </button>
      </ModalFooter>
    </Modal>
  );
});
