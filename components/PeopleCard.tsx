import React from 'react';
import { DiscoveryFeed } from '@/components/discovery/DiscoveryFeed';

/** Legacy entry point retained for callers; the production source is the server feed. */
export default function PeopleCard() {
  return <DiscoveryFeed />;
}
