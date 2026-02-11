export default function StatusTimeline({ status }) {
  const steps = [
    "Submitted",
    "New",
    "Open",
    "Pending",
    "Resolved",
    "Closed"
  ];

  const currentIndex = Math.max(0, steps.indexOf(status));
  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Status Timeline</h3>

      <div className="flex items-center space-x-4">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentIndex;
          const isActive = idx === currentIndex;
          return (
            <div key={step} className="flex items-center">
              <div className={`w-4 h-4 rounded-full flex items-center justify-center
                ${isCompleted ? "bg-green-600" : isActive ? "bg-blue-600" : "bg-gray-300"}`}></div>

              <div className={`ml-2 text-sm ${isCompleted ? "text-green-700" : isActive ? "text-blue-700 font-semibold" : "text-gray-500"}`}>
                {step}
              </div>

              {idx < steps.length - 1 && (
                <div className={`w-10 h-0.5 mx-3 ${isCompleted ? "bg-green-600" : "bg-gray-300"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
