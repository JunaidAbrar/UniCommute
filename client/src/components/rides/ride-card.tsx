import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Users, Car } from "lucide-react";
import type { Ride } from "@shared/schema";
import { useLocation } from "wouter";

interface RideCardProps {
  ride: Ride;
  onSwipe?: () => void;
}

export function RideCard({ ride, onSwipe }: RideCardProps) {
  const [, setLocation] = useLocation();

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(e, { offset, velocity }) => {
        if (offset.x > 100 && velocity.x > 20) {
          onSwipe?.();
        }
      }}
      className="touch-none"
    >
      <Card className="w-full max-w-sm mx-auto">
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar>
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
          <CardTitle className="text-lg">{ride.hostId}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Route:</span>
              </div>
              <div className="pl-6 space-y-1">
                <p className="text-sm">From: {ride.origin}</p>
                {ride.stopPoints && ride.stopPoints.map((stop, index) => (
                  <p key={index} className="text-sm text-muted-foreground">
                    Stop {index + 1}: {stop}
                  </p>
                ))}
                <p className="text-sm">To: {ride.destination}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {new Date(ride.departureTime).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{ride.seatsAvailable} seats available</span>
            </div>
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{ride.transportType}</span>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setLocation(`/chat/${ride.id}`)}
              >
                Chat
              </Button>
              <Button className="flex-1" onClick={onSwipe}>
                Join Ride
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}