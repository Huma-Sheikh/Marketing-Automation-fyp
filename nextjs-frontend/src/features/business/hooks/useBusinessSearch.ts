"use client";
import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/http";
import { leadsApi } from "@/features/leads/api";
import { businessApi } from "../api";
import type { Business, BusinessQuery, Region } from "../types";

const hasPhone = (b: Business) => !!(b.phone || b.phone_intl);

/**
 * Business Search page state: region list, search filters, results, and
 * importing callable results as leads.
 */
export function useBusinessSearch() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionsError, setRegionsError] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [freeLocation, setFreeLocation] = useState("");
  const [category, setCategory] = useState("dentist");
  const [opportunitiesOnly, setOpportunitiesOnly] = useState(true);

  const [results, setResults] = useState<Business[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);

  useEffect(() => {
    businessApi.regions()
      .then((r) => {
        setRegions(r);
        if (r.length) setRegionCode(r[0].code);
      })
      .catch((e) => {
        // The free-text location still works without the preset list.
        setRegions([]);
        setRegionsError(getErrorMessage(e, "Could not load regions"));
      });
  }, []);

  const search = async () => {
    const location = regionCode || freeLocation.trim();
    if (!location || !category.trim()) {
      setError("Pick a location and a category first");
      return;
    }
    setLoading(true);
    setError("");
    setImported(0);
    try {
      const query: BusinessQuery = {
        location,
        category: category.trim(),
        region_code: regionCode || undefined,
        max_results: 20,
      };
      const data = opportunitiesOnly
        ? await businessApi.opportunities(query)
        : await businessApi.search(query);
      setResults(data.businesses || []);
      setSearched(true);
      if (data.error) setError(data.error);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  /** Turn the callable results into leads so a campaign can dial them. */
  const importCallable = async () => {
    const callable = results.filter(hasPhone);
    if (!callable.length) return;

    setImporting(true);
    setError("");
    try {
      const leads = callable.map((b) => ({
        firstName: b.name,
        lastName: "",
        phone: b.phone_intl || b.phone,
        company: b.name,
        location: b.address,
        website: b.website || null,
        sourceplatform: "google-places",
        rawData: b,
      }));
      const res = await leadsApi.import(leads);
      setImported(res?.count ?? leads.length);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setImporting(false);
    }
  };

  return {
    regions, regionsError, regionCode, setRegionCode, freeLocation, setFreeLocation,
    category, setCategory, opportunitiesOnly, setOpportunitiesOnly,
    results, searched, loading, error, importing, imported,
    callableCount: results.filter(hasPhone).length,
    search, importCallable,
  };
}
