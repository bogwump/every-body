import React, { useState } from 'react';
import { BookOpen, Video, Headphones, ExternalLink, Search } from 'lucide-react';
import type { UserGoal } from '../types';

interface ResourcesProps {
  userGoal: UserGoal | null;
}

const articles = [
  {
    title: 'Understanding Your Menstrual Cycle',
    category: 'Education',
    duration: '5 min read',
    type: 'article',
    relevance: ['cycle-health', 'post-contraception', 'wellbeing'],
  },
  {
    title: 'Managing Perimenopause Symptoms',
    category: 'Health',
    duration: '8 min read',
    type: 'article',
    relevance: ['perimenopause', 'wellbeing'],
  },
  {
    title: 'Nutrition for Hormonal Balance',
    category: 'Nutrition',
    duration: '6 min read',
    type: 'article',
    relevance: ['cycle-health', 'perimenopause', 'post-contraception', 'wellbeing'],
  },
  {
    title: 'Meditation for Cycle Awareness',
    category: 'Wellness',
    duration: '10 min',
    type: 'audio',
    relevance: ['cycle-health', 'wellbeing'],
  },
  {
    title: 'Exercise Through Your Cycle',
    category: 'Fitness',
    duration: '12 min watch',
    type: 'video',
    relevance: ['cycle-health', 'wellbeing'],
  },
  {
    title: 'Sleep and Hormones',
    category: 'Health',
    duration: '7 min read',
    type: 'article',
    relevance: ['perimenopause', 'wellbeing'],
  },
];

const categories = ['All', 'Education', 'Health', 'Nutrition', 'Wellness', 'Fitness'];

export function Resources({ userGoal }: ResourcesProps) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredArticles = articles.filter((article) => {
    const matchesCategory = selectedCategory === 'All' || article.category === selectedCategory;
    const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGoal = !userGoal || article.relevance.includes(userGoal);
    return matchesCategory && matchesSearch && matchesGoal;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return Video;
      case 'audio':
        return Headphones;
      default:
        return BookOpen;
    }
  };

  const FeaturedIllustration = () => (
    <svg
      width="96"
      height="96"
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="opacity-95"
    >
      <defs>
        <linearGradient id="g1" x1="16" y1="10" x2="80" y2="86" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgba(255,255,255,0.95)" />
          <stop offset="1" stopColor="rgba(255,255,255,0.55)" />
        </linearGradient>
      </defs>

      {/* Soft ring */}
      <circle cx="48" cy="48" r="30" stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
      <circle cx="48" cy="48" r="20" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />

      {/* Leaf + dot */}
      <path
        d="M60 30C52 30 44.5 36 42 46.5C40.2 54.1 44.2 61.2 51.2 64.8C59.5 69 68.5 63.8 70.5 54.7C72.8 43.8 67.2 34.8 60 30Z"
        stroke="url(#g1)"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <circle cx="34" cy="62" r="4" fill="rgba(255,255,255,0.7)" />
      <path d="M28 36C33 39 36 44 36 50" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  const MiniCardIllustration = ({ kind }: { kind: string }) => {
    // Tiny inline SVG background for the resource icon tile (no assets).
    // Uses current theme variables so it always matches your chosen colours.
    const isHealth = kind === 'Health';
    const isNutrition = kind === 'Nutrition';
    const isWellness = kind === 'Wellness';
    const isFitness = kind === 'Fitness';
    const tone = isHealth ? 0.18 : isNutrition ? 0.16 : isWellness ? 0.14 : isFitness ? 0.15 : 0.12;
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 48 48"
        className="absolute inset-0"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="m1" x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
            <stop stopColor={`rgba(255,255,255,${0.55})`} />
            <stop offset="1" stopColor={`rgba(255,255,255,${0.05})`} />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="48" height="48" rx="12" fill={`rgb(var(--color-primary)/${tone})`} />
        <path d="M8 30C13 24 18 22 24 22C30 22 35 24 40 30" stroke="url(#m1)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M10 18C14 16 18 15 24 15C30 15 34 16 38 18" stroke="rgba(255,255,255,0.22)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="34" r="2" fill="rgba(255,255,255,0.35)" />
        <circle cx="34" cy="16" r="2.2" fill="rgba(255,255,255,0.28)" />
      </svg>
    );
  };



  return (
    <div className="eb-page">
      <div className="eb-page-inner">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2">Resources & Learning</h1>
          <p>Evidence-based content to support your wellness journey</p>
        </div>

        {/* Featured Resource */}
        <div className="eb-hero-surface eb-hero-on-dark rounded-3xl p-8 mb-8 overflow-hidden shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <span className="text-xs px-3 py-1 rounded-full bg-[rgba(255,255,255,0.45)] border border-[rgba(0,0,0,0.12)] mb-3 inline-block">
                Featured
              </span>
              <h2 className="mb-3 text-white">Cycle Syncing Masterclass</h2>
              <p className="eb-hero-on-dark-muted mb-4">
                Learn how to align your lifestyle, nutrition, and activities with your natural hormonal rhythm
              </p>
              <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[rgb(var(--color-primary))] hover:shadow-lg transition-all font-medium">
                Start Learning
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
            <div className="hidden md:block w-32 h-32 rounded-2xl bg-[rgba(255,255,255,0.18)] overflow-hidden flex items-center justify-center">
              <FeaturedIllustration />
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[rgb(var(--color-text-secondary))]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search resources..."
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary))] focus:border-transparent bg-white"
            />
          </div>
        </div>

        {/* Category Filter */}
        <div className="mb-8 overflow-x-auto">
          <div className="flex gap-2 pb-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all ${
                  selectedCategory === category
                    ? 'bg-[rgb(var(--color-primary))] text-white'
                    : 'bg-white border border-neutral-200 text-[rgb(var(--color-text-secondary))] hover:border-[rgb(var(--color-primary))]'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Resources Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredArticles.map((article, index) => {
            const Icon = getTypeIcon(article.type);

            return (
              <div
                key={index}
                className="eb-card p-6 hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl relative overflow-hidden flex items-center justify-center">
                    <MiniCardIllustration kind={article.category} />
                    <Icon className="w-6 h-6 relative z-10 text-[rgb(var(--color-primary))]" />
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full bg-[rgb(var(--color-accent)/0.18)] text-[rgb(var(--color-text))]">
                    {article.category}
                  </span>
                </div>
                <h3 className="mb-2 group-hover:text-[rgb(var(--color-primary))] transition-colors">
                  {article.title}
                </h3>
                <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-4">
                  {article.duration}
                </p>
                <div className="flex items-center gap-2 text-[rgb(var(--color-primary))]">
                  <span className="text-sm font-medium">Read more</span>
                  <ExternalLink className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>

        {filteredArticles.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[rgb(var(--color-text-secondary))]">No resources found matching your search.</p>
          </div>
        )}

        {/* Expert Section */}
        <div className="mt-12 bg-gradient-to-br from-[rgb(var(--color-accent))] from-opacity-20 to-transparent rounded-2xl p-8 border border-[rgb(var(--color-accent))] border-opacity-30">
          <h3 className="mb-4">Need Personalized Guidance?</h3>
          <p className="mb-6 text-[rgb(var(--color-text-secondary))]">
            Connect with healthcare professionals who specialize in women's hormone health
          </p>
          <button className="px-6 py-3 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium">
            Find a Specialist
          </button>
        </div>
      </div>
    </div>
  );
}