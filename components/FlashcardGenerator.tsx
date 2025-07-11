'use client';

import { useState, useEffect, useRef, CSSProperties } from 'react';
import { supabase } from '../src/lib/supabase';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';

type Flashcard = {
  question: string;
  answer: string;
};

function debounce<Args extends unknown[], Return>(
  fn: (...args: Args) => Return,
  delay: number
): (...args: Args) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      void fn(...args);
    }, delay);
  };
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

export default function FlashcardGenerator({
  deckId,
  onGenerated,
  sx,
}: {
  deckId: string;
  onGenerated: () => void;
  sx?: CSSProperties; // <-- add sx prop here
}) {
  const [text, setText] = useState('');
  const [numQuestionsStr, setNumQuestionsStr] = useState('3');
  const [previewFlashcards, setPreviewFlashcards] = useState<Flashcard[]>([]);
  const [error, setError] = useState('');

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingGenerate, setLoadingGenerate] = useState(false);

  const generatingRef = useRef(false);

  const numQuestions = (() => {
    const parsed = parseInt(numQuestionsStr, 5);
    if (isNaN(parsed)) return 3;
    if (parsed < 0) return 0;
    if (parsed > 5) return 5;
    return parsed;
  })();

  const debouncedFetchPreview = useRef(
    debounce(async (inputText: string, numQ: number) => {
      if (generatingRef.current) return;

      if (!inputText.trim()) {
        setPreviewFlashcards([]);
        setError('');
        setLoadingPreview(false);
        return;
      }

      setLoadingPreview(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE_URL}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: inputText, num_questions: numQ }),
        });

        if (!res.ok) throw new Error('Failed to fetch preview');

        const data = await res.json();

        if (data.error) {
          setError(data.error);
          setPreviewFlashcards([]);
        } else {
          setPreviewFlashcards(data.flashcards || []);
          setError('');
        }
      } catch (err) {
        console.error(err);
        setError('Failed to generate preview.');
        setPreviewFlashcards([]);
      } finally {
        setLoadingPreview(false);
      }
    }, 800)
  ).current;

  useEffect(() => {
    if (!generatingRef.current) {
      debouncedFetchPreview(text, numQuestions);
    }
  }, [text, numQuestions, debouncedFetchPreview]);

  const generate = async () => {
    if (!deckId || !text.trim()) return;

    generatingRef.current = true;
    setLoadingGenerate(true);
    setError('');
    setPreviewFlashcards([]);

    try {
      const res = await fetch(`${API_BASE_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, num_questions: numQuestions }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Backend failed: ${errorText}`);
      }

      const data = await res.json();

      if (!data.flashcards || data.flashcards.length === 0) {
        throw new Error('No flashcards returned from backend');
      }

      const inserts = data.flashcards.map((fc: Flashcard) => ({
        ...fc,
        deck_id: deckId,
      }));

      const { error: insertError } = await supabase
        .from('flashcards')
        .insert(inserts)
        .select();

      if (insertError) {
        console.error('Supabase insert error:', insertError);
        throw insertError;
      }

      setText('');
      setNumQuestionsStr('3');
      onGenerated();
      toast.success(`${inserts.length} flashcards generated!`);
      setPreviewFlashcards([]);
      setError('');
    } catch (err: unknown) {
      console.error('Error during generate:', err);
      toast.error('Failed to generate or save flashcards.');
      setError('Something went wrong while generating flashcards. Please try again.');
    } finally {
      setLoadingGenerate(false);
      generatingRef.current = false;
      if (text.trim()) {
        debouncedFetchPreview(text, numQuestions);
      }
    }
  };

  const clearInputs = () => {
    setText('');
    setNumQuestionsStr('3');
    setPreviewFlashcards([]);
    setError('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white/10 backdrop-blur-md p-8 rounded-2xl shadow-2xl border border-white/20 mb-12 space-y-6 transition-all hover:scale-[1.01] text-white"
      style={sx} // <-- Apply the sx styles here inline
    >
      <h2 className="text-3xl font-semibold drop-shadow mb-4">Generate Flashcards</h2>

      <textarea
        rows={5}
        className="w-full p-4 rounded-lg border border-white/20 bg-white/20 text-white placeholder-indigo-200 focus:ring-2 focus:ring-pink-300 focus:outline-none transition mb-6"
        placeholder="Paste paragraph or text here..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={loadingGenerate}
      />

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <input
          type="number"
          min={1}
          max={5}
          value={numQuestionsStr}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '') {
              setNumQuestionsStr('');
            } else if (/^\d+$/.test(val)) {
              const sanitized = val.replace(/^0+/, '') || '0';
              setNumQuestionsStr(sanitized);
            }
          }}
          className="w-full sm:w-24 p-3 rounded-lg border border-white/20 bg-white/20 text-white"
          disabled={loadingGenerate}
        />
        <button
          onClick={generate}
          disabled={loadingGenerate || !text.trim()}
          className="w-full sm:w-auto bg-pink-500 hover:bg-pink-600 text-white px-6 py-3 rounded-lg font-medium transition shadow-md hover:shadow-xl"
        >
          {loadingGenerate ? 'Generating...' : '⚡ Generate'}
        </button>
        <button
          onClick={clearInputs}
          disabled={loadingGenerate}
          className="w-full sm:w-auto bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition shadow-md hover:shadow-xl"
        >
          Clear
        </button>
      </div>

      {error && <p className="text-red-300">{error}</p>}

      <div>
        <h3 className="text-2xl font-semibold mb-2">Live Preview</h3>
        {loadingPreview && !loadingGenerate && (
          <p className="italic text-indigo-100">Loading preview...</p>
        )}
        {!loadingPreview && previewFlashcards.length === 0 && (
          <p className="italic text-indigo-100">Flashcards preview will appear here...</p>
        )}

        <ul className="space-y-4 mt-4">
          {previewFlashcards.map((fc, i) => (
            <li
              key={i}
              className="border border-white/20 rounded-xl p-4 bg-white/10 backdrop-blur"
            >
              <div className="mb-2">
                <p className="text-indigo-100 font-semibold mb-1">Q:</p>
                <div className="text-white">
                  <ReactMarkdown>{fc.question}</ReactMarkdown>
                </div>
              </div>
              <div>
                <p className="text-indigo-100 font-semibold mb-1">A:</p>
                <div className="text-white">
                  <ReactMarkdown>{fc.answer}</ReactMarkdown>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
