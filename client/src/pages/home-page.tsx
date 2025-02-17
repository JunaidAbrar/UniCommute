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
import { Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Ride } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: rides = [] } = useQuery<Ride[]>({
    queryKey: ["/api/rides"],
  });

  const filteredRides = useMemo(() => {
    if (!searchQuery.trim()) return rides;

    const query = searchQuery.toLowerCase();
    return rides.filter((ride) => {
      const searchableText = `
        ${ride.origin.toLowerCase()}
        ${ride.destination.toLowerCase()}
        ${ride.stopPoints.join(" ").toLowerCase()}
      `;
      return searchableText.includes(query);
    });
  }, [rides, searchQuery]);

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

        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Create a New Ride</SheetTitle>
              <SheetDescription>
                Fill in the details to offer a ride
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4">
              <RideForm />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          placeholder="Search origin, destination or stops..."
        />
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
              {searchQuery.trim() ? "No rides found matching your search" : "No rides available"}
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
                <RideCard
                  ride={ride}
                  onSwipe={() => handleJoinRide(ride.id)}
                />
              </motion.div>
            ))
          )}
        </div>
      </AnimatePresence>
    </div>
  );
}