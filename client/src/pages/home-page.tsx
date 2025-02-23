import { RideCard } from "@/components/rides/ride-card";
import { RideForm } from "@/components/rides/ride-form";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Plus, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Ride, User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";

// Extended type for rides with full details
type RideWithDetails = Omit<Ride, 'participants'> & {
  host: Pick<User, 'username' | 'university'>;
  participants: User[];
};

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { user } = useAuth();

  const { data: rides = [] } = useQuery<RideWithDetails[]>({
    queryKey: ["/api/rides"],
  });

  // Separate user's active ride and other rides
  const { activeRide, otherRides } = useMemo(() => {
    const active = rides.find(
      (ride) => ride.participants.some(p => p.id === user?.id) && ride.isActive
    );
    const others = rides.filter((ride) => ride.id !== active?.id);
    return { activeRide: active, otherRides: others };
  }, [rides, user?.id]);


  // Filter rides based on search query
  const filteredRides = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      // If no search query, return active ride first, then others
      return activeRide ? [activeRide, ...otherRides] : otherRides;
    }

    // Filter function with ride number support
    const matchesSearch = (ride: Ride) => {
      const rideNumber = `ride#${ride.id}`;
      const searchableText = `
        ${rideNumber}
        ${ride.id}
        ${ride.origin.toLowerCase()}
        ${ride.destination.toLowerCase()}
        ${ride.stopPoints.join(" ").toLowerCase()}
      `;
      return searchableText.includes(query);
    };

    // If active ride matches search, include it first
    const matches = [];
    if (activeRide && matchesSearch(activeRide)) {
      matches.push(activeRide);
    }

    // Add other matching rides
    matches.push(...otherRides.filter(matchesSearch));

    return matches;
  }, [activeRide, otherRides, searchQuery]);

  const handleJoinRide = async (rideId: number) => {
    try {
      await apiRequest("POST", "/api/requests", { rideId });
    } catch (error) {
      console.error("Failed to join ride:", error);
    }
  };

  return (
    <div className="container max-w-md p-4 pb-24 mx-auto min-h-screen">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">UniCommute</h1>
          <p className="text-sm text-muted-foreground">Find your next ride</p>
        </div>

        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <Button size="icon" className="h-12 w-12">
              <Plus className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="h-[90vh] sm:h-full rounded-t-[10px] sm:rounded-t-none"
          >
            <SheetHeader className="sticky top-0 bg-background z-10 pb-4">
              <SheetTitle>Create a New Ride</SheetTitle>
              <SheetDescription>
                Fill in the details to offer a ride
              </SheetDescription>
            </SheetHeader>
            <RideForm onSuccess={() => setIsSheetOpen(false)} />
          </SheetContent>
        </Sheet>
      </header>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault(); 
              setSearchQuery(e.target.value);
            }
          }}
          className="pl-9 pr-9 h-12 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
          placeholder="Search by Ride Number or Location (Press Enter to search)..."
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8"
            onClick={() => setSearchQuery("")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        <div className="space-y-4">
          {filteredRides.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center py-8 text-muted-foreground"
            >
              {searchQuery.trim()
                ? "No rides found matching your search"
                : "No rides available"}
            </motion.div>
          ) : (
            filteredRides.map((ride) => (
              <motion.div
                key={ride.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <RideCard ride={ride} onSwipe={() => handleJoinRide(ride.id)} />
              </motion.div>
            ))
          )}
        </div>
      </AnimatePresence>
    </div>
  );
}