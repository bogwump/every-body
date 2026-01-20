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

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2">Resources & Learning</h1>
          <p>Evidence-based content to support your wellness journey</p>
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

        {/* Featured Resource */}
        <div className="bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-primary-dark))] rounded-2xl p-8 mb-8 text-white">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <span className="text-xs px-3 py-1 rounded-full bg-white bg-opacity-20 text-white mb-3 inline-block">
                Featured
              </span>
              <h2 className="text-white mb-3">Cycle Syncing Masterclass</h2>
              <p className="text-white text-opacity-90 mb-4">
                Learn how to align your lifestyle, nutrition, and activities with your natural hormonal rhythm
              </p>
              <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[rgb(var(--color-primary))] hover:shadow-lg transition-all font-medium">
                Start Learning
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
            <div className="hidden md:block w-32 h-32 rounded-2xl bg-white bg-opacity-20" />
          </div>
        </div>

        {/* Resources Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredArticles.map((article, index) => {
            const Icon = getTypeIcon(article.type);

            return (
              <div
                key={index}
                className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-[rgb(var(--color-primary))] bg-opacity-10 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-[rgb(var(--color-primary))]" />
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full bg-[rgb(var(--color-accent))] bg-opacity-20 text-[rgb(var(--color-text))]">
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