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
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Ride } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export default function HomePage() {
  const { data: rides = [] } = useQuery<Ride[]>({
    queryKey: ["/api/rides"],
  });

  const handleJoinRide = async (rideId: number) => {
    try {
      await apiRequest("POST", "/api/requests", { rideId });
    } catch (error) {
      console.error("Failed to join ride:", error);
    }
  };

  return (
    <div className="container max-w-md p-4 pb-16">
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

      <div className="space-y-4">
        {rides.map((ride) => (
          <RideCard
            key={ride.id}
            ride={ride}
            onSwipe={() => handleJoinRide(ride.id)}
          />
        ))}
      </div>
    </div>
  );
}
